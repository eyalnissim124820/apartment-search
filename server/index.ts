import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ApartmentService, HttpError, SettingsService, assertUser } from './service';
import { createStore } from './store';
import { PushService, startViewingReminders } from './push';
import { Enricher } from './enrich';
import { importFromText, importFromUrl } from './importer';

const store = createStore();
const push = new PushService(store);
const enricher = new Enricher(store);
const service = new ApartmentService(store, {
  onEvent: (e) => push.notify(e),
  onLocationChange: (apt) => enricher.schedule(apt),
});
const settings = new SettingsService(
  store,
  () => push.publicKey(),
  (address) => enricher.locate(address),
  () => void enricher.refreshAll().catch((err) => console.warn('[geo]', err)),
);

const app = express();
app.use(express.json({ limit: '15mb' })); // room for a few compressed photos

type Handler = (req: Request) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req).then((out) => (out === undefined ? res.status(204).end() : res.json(out)), next);

/** Acting user comes from the X-User header (no auth – identification only). */
const actor = (req: Request) => assertUser(req.header('x-user'));

const api = express.Router();
api.get('/health', h(async () => ({ ok: true })));
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
api.post('/geo/refresh', h(async () => { void enricher.refreshAll(true); return { ok: true }; }));

api.post('/push/subscribe', h(async (req) => {
  try {
    await push.subscribe(actor(req), req.body.subscription, req.body.lang === 'en' ? 'en' : 'he');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, (err as Error).message);
  }
}));
api.post('/push/unsubscribe', h((req) => push.unsubscribe(String(req.body?.endpoint ?? ''))));
api.post('/push/test', h((req) => push.test(actor(req))));
app.use('/api', api);

// Serve the built client in production.
const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

startViewingReminders(store, push);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
