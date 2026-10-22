import express, { type NextFunction, type Request, type Response } from 'express';
import { ApartmentService, HttpError, SettingsService, assertUser } from './service.js';
import { createStore } from './store/index.js';
import { PushService, sendDueReminders } from './push.js';
import { Enricher } from './enrich.js';
import { importFromText, importFromUrl } from './importer.js';
import { background } from './background.js';
import { Yad2Scanner, scanConfigured } from './yad2Scan.js';
import type { ScanSource } from '../shared/types.js';

/** Build the API. Shared by the local server (server/index.ts) and the Vercel function (api/index.ts). */
export function createApp() {
  const store = createStore();
  const push = new PushService(store);
  const enricher = new Enricher(store);
  const service = new ApartmentService(store, {
    onEvent: (e) => void push.notify(e),
    onLocationChange: (apt) => enricher.schedule(apt),
  });
  const settings = new SettingsService(
    store,
    () => push.publicKey(),
    (address) => enricher.locate(address),
    () => void background(enricher.refreshAll(), 'geo refresh'),
  );

  const scanner = new Yad2Scanner(store);

  /** Public origin of this deployment, for the Apify webhook. */
  const origin = (req: Request) =>
    process.env.APP_URL?.replace(/\/+$/, '') ||
    `https://${req.header('x-forwarded-host') ?? req.header('host')}`;

  const app = express();
  app.use(express.json({ limit: '15mb' })); // room for a few compressed photos (Vercel caps bodies at 4.5MB)

  type Handler = (req: Request) => Promise<unknown>;
  const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
    fn(req).then((out) => (out === undefined ? res.status(204).end() : res.json(out)), next);

  /** Acting user comes from the X-User header (no auth – identification only). */
  const actor = (req: Request) => assertUser(req.header('x-user'));

  const api = express.Router();

  /** Connection check: storage reachable, push configured. */
  api.get(
    '/health',
    h(async () => {
      const out: Record<string, unknown> = {
        ok: true,
        storage: process.env.STORAGE === 'supabase' ? 'supabase' : 'json',
        runtime: process.env.VERCEL ? 'vercel' : 'node',
        vapidFromEnv: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
        cronSecretSet: !!process.env.CRON_SECRET,
        scraperConfigured: !!process.env.SCRAPINGBEE_API_KEY,
        apifyConfigured: scanConfigured(),
      };
      try {
        out.apartments = (await store.list()).length;
        const meta = await store.getMeta();
        out.pushSubscriptions = meta.subscriptions.length;
        out.workplaces = Object.keys(meta.settings.work).length;
        out.vapidReady = !!(await push.publicKey());
      } catch (err) {
        out.ok = false;
        out.storageError = err instanceof Error ? err.message : String(err);
      }
      return out;
    }),
  );

  api.get('/apartments', h(() => service.list()));
  api.get('/apartments/:id', h((req) => service.get(req.params.id)));
  api.post('/apartments', h((req) => service.create(req.body, actor(req))));
  api.patch('/apartments/:id', h((req) => service.update(req.params.id, req.body, actor(req))));
  api.delete('/apartments/:id', h((req) => service.remove(req.params.id)));
  api.post('/apartments/:id/vote', h((req) => service.vote(req.params.id, actor(req), req.body.vote ?? null)));
  api.post('/apartments/:id/status', h((req) => service.setStatus(req.params.id, req.body.status, actor(req))));
  api.post('/apartments/:id/restore', h((req) => service.restore(req.params.id, actor(req))));
  api.post('/apartments/:id/rating', h((req) => service.rate(req.params.id, actor(req), req.body.rating)));
  api.post('/apartments/:id/favorite', h((req) => service.toggleFavorite(req.params.id, actor(req))));
  api.post('/apartments/:id/contacts', h((req) => service.upsertContact(req.params.id, req.body)));
  api.delete('/apartments/:id/contacts/:cid', h((req) => service.removeContact(req.params.id, req.params.cid)));
  api.post('/apartments/:id/comments', h((req) => service.addComment(req.params.id, actor(req), req.body.text)));
  api.delete(
    '/apartments/:id/comments/:cid',
    h((req) => service.removeComment(req.params.id, req.params.cid, actor(req))),
  );
  api.post('/apartments/:id/checklist', h((req) => service.setChecklist(req.params.id, actor(req), req.body)));
  api.post(
    '/apartments/:id/locate',
    h(async (req) => {
      await enricher.enrich(req.params.id, true);
      return service.get(req.params.id);
    }),
  );

  api.post(
    '/import',
    h(async (req) => {
      const { url, text } = req.body as { url?: string; text?: string };
      if (text?.trim()) return importFromText(text, url);
      if (!url) throw new HttpError(400, 'url or text is required');
      try {
        return await importFromUrl(url);
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
    }),
  );

  api.get('/settings', h(() => settings.get()));
  api.patch('/settings', h((req) => settings.update(req.body)));
  api.post('/settings', h((req) => settings.update(req.body))); // same, for clients without PATCH (e.g. pg_net)
  api.post(
    '/geo/refresh',
    h(async () => {
      void background(enricher.refreshAll(true), 'geo refresh');
      return { ok: true };
    }),
  );

  api.post(
    '/push/subscribe',
    h(async (req) => {
      try {
        await push.subscribe(actor(req), req.body.subscription, req.body.lang === 'en' ? 'en' : 'he');
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(400, (err as Error).message);
      }
    }),
  );
  api.post('/push/unsubscribe', h((req) => push.unsubscribe(String(req.body?.endpoint ?? ''))));
  api.post('/push/test', h((req) => push.test(actor(req))));

  /**
   * Viewing reminders. Called by a scheduler (Supabase pg_cron / Vercel Cron)
   * every few minutes. Protected by CRON_SECRET when it is set.
   */
  const cron = h(async (req) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.header('authorization') !== `Bearer ${secret}`) throw new HttpError(401, 'Unauthorized');
    return { sent: await sendDueReminders(store, push) };
  });
  api.get('/cron/reminders', cron);
  api.post('/cron/reminders', cron);

  const requireSecret = (req: Request) => {
    const secret = process.env.CRON_SECRET;
    const given = req.header('authorization')?.replace(/^Bearer /, '') ?? String(req.query.secret ?? '');
    if (secret && given !== secret) throw new HttpError(401, 'Unauthorized');
  };

  /** Start an automatic Yad2 scan (Apify). Manual from the app, or scheduled via cron. */
  const startScan = async (req: Request) => {
    try {
      return await scanner.start(origin(req));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  };
  api.post('/yad2/scan', h(async (req) => { actor(req); return startScan(req); }));
  const cronScan = h(async (req) => { requireSecret(req); return startScan(req); });
  api.get('/cron/yad2-scan', cronScan);
  api.post('/cron/yad2-scan', cronScan);
  api.get('/cron/scan', cronScan);
  api.post('/cron/scan', cronScan);

  /** Apify calls this when a scan run finishes. */
  api.post(
    '/apify/webhook',
    h(async (req) => {
      requireSecret(req);
      const body = req.body as { eventData?: { actorRunId?: string }; resource?: { id?: string } };
      const runId = body.eventData?.actorRunId ?? body.resource?.id;
      if (!runId) throw new HttpError(400, 'Missing run id');
      const source: ScanSource = req.query.source === 'madlan' ? 'madlan' : 'yad2';
      try {
        const items = await scanner.collect(runId, source);
        if (!items) return { ok: true, skipped: true };
        const matching = await scanner.applyFilters(items, source);
        const added = await service.importExternal(matching);
        await scanner.finish(source, runId, items.length, matching.length, added.length);
        await push.notifyScan(added);
        void background(enricher.enrichMany(added.map((a) => a.id)), 'geo scan');
        return { ok: true, found: items.length, matched: matching.length, added: added.length };
      } catch (err) {
        await scanner.fail(source, runId, (err as Error).message);
        throw err;
      }
    }),
  );

  app.use('/api', api);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  return { app, store, push };
}
