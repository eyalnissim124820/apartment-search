import type { Apartment, ApartmentInput, Features, ScanSource, ScanStatus, SourceRunStatus } from '../shared/types.js';
import { geoQuery } from '../shared/workflow.js';
import { suggestTitle } from './importer.js';
import { buildYad2SearchUrl, matchesScanFilters } from '../shared/yad2.js';
import type { Store } from './store/Store.js';
import { MADLAN_ACTOR, madlanInput, mapMadlanItem, type MadlanItem } from './madlanScan.js';

/**
 * Automatic listing scan through Apify: Yad2 (actor amit123/YadScraper) and Madlan (see madlanScan.ts).
 *
 * Flow (works inside Vercel's 60s function limit because nothing waits on the scrape):
 *   start()         → POST /v2/acts/{actor}/runs with an ad-hoc webhook pointing back at us
 *   Apify finishes  → POST /api/apify/webhook?secret=…  → handleRunFinished()
 *                   → read the run's dataset → map items → caller imports the new ones
 *
 * Env: APIFY_TOKEN (required), APIFY_YAD2_ACTOR, APIFY_MADLAN_ACTOR, APIFY_YAD2_MAX_ITEMS (results per search /
 * per city, per source), APIFY_MAX_CHARGE_USD (per run) – all optional.
 */

const API = 'https://api.apify.com/v2';

/** A listing found by the scan, ready for ApartmentService.importExternal. */
export type ScannedListing = ApartmentInput & { externalId: string; geo?: Apartment['geo'] };
const ACTOR = () => (process.env.APIFY_YAD2_ACTOR ?? 'amit123/YadScraper').replace('/', '~');
/** Results per scan, per search. The actor charges per result, so this is the cost cap. */
const MAX_ITEMS = () => Math.max(1, Number(process.env.APIFY_YAD2_MAX_ITEMS ?? 20));
const MAX_CHARGE = () => Number(process.env.APIFY_MAX_CHARGE_USD ?? 0.5);

export const scanConfigured = () => !!process.env.APIFY_TOKEN;

async function apify<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.APIFY_TOKEN}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

interface ApifyRun {
  id: string;
  status: string; // READY | RUNNING | SUCCEEDED | FAILED | TIMED-OUT | ABORTED …
  defaultDatasetId: string;
}

/** Raw dataset item, per the actor's README. Everything is optional – be defensive. */
export interface Yad2Item {
  item_id?: string;
  item_url?: string;
  location?: string;
  price?: number | string;
  rooms?: number | string;
  square_meter?: number | string;
  floor?: number | string;
  building_top_floor?: number | string;
  entrance_date?: string;
  property_condition?: string;
  description?: string;
  images?: (string | { url?: string; src?: string })[];
  geographic_polygon?: { type?: string; coordinates?: [number, number] } | { lat?: number; lon?: number; lng?: number };
  mediation?: boolean;
  include_air_condition?: boolean;
  elevator?: boolean;
  parking?: boolean;
  safe_room?: boolean;
  balcony?: boolean;
  is_pets_allowed?: boolean;
  furnished?: boolean;
  is_renovated?: boolean;
  [k: string]: unknown;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Convert one actor result into our apartment shape. */
export function mapYad2Item(it: Yad2Item): ScannedListing | null {
  const url = typeof it.item_url === 'string' ? it.item_url : undefined;
  const id = it.item_id ?? url?.match(/item\/([^/?#]+)/)?.[1];
  if (!id) return null;

  // "street, neighborhood, city" – last part is the city, first is the street.
  const parts = String(it.location ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const address = parts.length > 1 ? parts[0] : undefined;
  const neighborhood = parts.length > 2 ? parts.slice(1, -1).join(', ') : undefined;

  const features: Features = {};
  if (it.include_air_condition) features.airConditioning = true;
  if (it.elevator) features.elevator = true;
  if (it.parking) features.parking = true;
  if (it.safe_room) features.safeRoom = true;
  if (it.balcony) features.balcony = true;
  if (it.is_pets_allowed) features.petsAllowed = true;
  if (it.furnished) features.furnished = true;
  if (it.is_renovated) features.renovated = true;

  const images = (it.images ?? [])
    .map((x) => (typeof x === 'string' ? x : x?.url ?? x?.src))
    .filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x))
    .slice(0, 10);

  const out: ScannedListing = {
    externalId: `yad2:${id}`,
    title: '',
    listingUrl: url ?? `https://www.yad2.co.il/realestate/item/${id}`,
    source: 'yad2',
    price: num(it.price),
    rooms: num(it.rooms),
    sizeSqm: num(it.square_meter),
    floor: it.floor === 0 || it.floor === '0' ? 0 : num(it.floor),
    totalFloors: num(it.building_top_floor),
    city,
    neighborhood,
    address,
    entryDate: /^\d{4}-\d{2}-\d{2}/.test(it.entrance_date ?? '') ? it.entrance_date!.slice(0, 10) : undefined,
    description: [
      it.description?.trim(),
      [it.property_condition, it.mediation ? 'תיווך' : undefined].filter(Boolean).join(' · ') || undefined,
    ]
      .filter(Boolean)
      .join('\n\n') || undefined,
    images,
    features,
  };

  // GeoJSON Point is [lon, lat]; also accept {lat, lon}.
  const g = it.geographic_polygon as { coordinates?: [number, number]; lat?: number; lon?: number; lng?: number } | undefined;
  const lat = g?.coordinates?.[1] ?? g?.lat;
  const lng = g?.coordinates?.[0] ?? g?.lon ?? g?.lng;
  if (typeof lat === 'number' && typeof lng === 'number') {
    out.geo = { lat, lng, query: geoQuery(out) };
  }

  out.title = suggestTitle(out) ?? (city ? `דירה ב${city}` : 'דירה מיד2');
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k];
  return out;
}

type SourceRun = SourceRunStatus;

/** Runs the automatic scan on every enabled source (Yad2, Madlan) and tracks each run. */
export class Yad2Scanner {
  constructor(private readonly store: Store) {}

  /** Update one source's run and recompute the overall status and totals. */
  private async setSource(source: ScanSource, patch: Partial<SourceRun> & Pick<SourceRun, 'status'>, reset = false) {
    const meta = await this.store.getMeta();
    const prev = reset ? undefined : meta.scan;
    const sources = { ...(prev?.sources ?? {}), [source]: { ...(prev?.sources?.[source] ?? {}), ...patch } };
    const runs = Object.values(sources) as SourceRun[];
    const sum = (k: 'found' | 'matched' | 'added') =>
      runs.some((r) => r[k] != null) ? runs.reduce((n, r) => n + (r[k] ?? 0), 0) : undefined;
    const status: SourceRun['status'] = runs.some((r) => r.status === 'running')
      ? 'running'
      : runs.every((r) => r.status === 'failed')
        ? 'failed'
        : 'succeeded';
    meta.scan = {
      status,
      startedAt: reset ? new Date().toISOString() : prev?.startedAt ?? new Date().toISOString(),
      finishedAt: status === 'running' ? undefined : new Date().toISOString(),
      found: sum('found'),
      matched: sum('matched'),
      added: sum('added'),
      error: runs.filter((r) => r.error).map((r) => r.error).join(' · ') || undefined,
      sources,
    };
    await this.store.saveMeta(meta);
    return meta.scan;
  }

  private webhooks(baseUrl: string, source: ScanSource) {
    const secret = encodeURIComponent(process.env.CRON_SECRET ?? '');
    return Buffer.from(
      JSON.stringify([
        {
          eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'],
          requestUrl: `${baseUrl}/api/apify/webhook?source=${source}&secret=${secret}`,
        },
      ]),
    ).toString('base64');
  }

  private async run(actor: string, input: unknown, maxItems: number, baseUrl: string, source: ScanSource) {
    const qs = new URLSearchParams({
      timeout: '600',
      maxItems: String(maxItems),
      maxTotalChargeUsd: String(MAX_CHARGE()),
      webhooks: this.webhooks(baseUrl, source),
    });
    const { data } = await apify<{ data: ApifyRun }>(`/acts/${actor}/runs?${qs}`, { method: 'POST', body: JSON.stringify(input) });
    return data.id;
  }

  /** Start one actor run per enabled source. `baseUrl` is this app's public origin, for the webhooks. */
  async start(baseUrl: string): Promise<ScanStatus> {
    if (!scanConfigured()) throw new Error('APIFY_TOKEN is not set');
    const meta = await this.store.getMeta();
    // Don't stack runs: a scan that started < 15 minutes ago is still considered in progress.
    if (meta.scan?.status === 'running' && Date.now() - new Date(meta.scan.startedAt).getTime() < 15 * 60_000) {
      return meta.scan;
    }
    const filters = meta.settings.yad2Filters;
    const sources = meta.settings.scanSources?.length ? meta.settings.scanSources : (['yad2'] as ScanSource[]);
    const jobs: { source: ScanSource; go: () => Promise<string> }[] = [];

    if (sources.includes('yad2')) {
      // Search links built from the Settings filters, plus any hand-picked links.
      const urls = [
        ...(filters?.cities ?? []).map((city) => buildYad2SearchUrl(city, filters!)),
        ...(meta.settings.yad2Searches ?? []).map((s) => s.url),
      ];
      if (urls.length) {
        const input = {
          start_urls: urls.map((url) => ({ url })),
          maxPagesPerSearch: 1,
          // one list page + one detail page per result, per search
          maxRequestsPerCrawl: urls.length * (MAX_ITEMS() + 1),
          proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'IL' },
        };
        jobs.push({ source: 'yad2', go: () => this.run(ACTOR(), input, MAX_ITEMS() * urls.length, baseUrl, 'yad2') });
      }
    }
    if (sources.includes('madlan') && filters?.cities.length) {
      const input = madlanInput(filters, MAX_ITEMS());
      jobs.push({ source: 'madlan', go: () => this.run(MADLAN_ACTOR(), input, MAX_ITEMS() * filters.cities.length, baseUrl, 'madlan') });
    }
    if (!jobs.length) throw new Error('Choose at least one city in the scan filters');

    let status: ScanStatus | undefined;
    for (const [i, job] of jobs.entries()) {
      try {
        const runId = await job.go();
        status = await this.setSource(job.source, { status: 'running', runId }, i === 0);
      } catch (err) {
        status = await this.setSource(job.source, { status: 'failed', error: `${job.source}: ${(err as Error).message}` }, i === 0);
      }
    }
    return status!;
  }

  /** Called from the webhook. Returns mapped items to import, or null if the run didn't succeed / was handled. */
  async collect(runId: string, source: ScanSource): Promise<ScannedListing[] | null> {
    const meta = await this.store.getMeta();
    const prev = meta.scan?.sources?.[source];
    if (prev?.runId === runId && prev.status !== 'running') return null; // duplicate delivery
    const { data: run } = await apify<{ data: ApifyRun }>(`/actor-runs/${runId}`);
    if (run.status !== 'SUCCEEDED') {
      await this.setSource(source, { status: 'failed', runId, error: `${source}: run ${run.status}` });
      return null;
    }
    const items = await apify<unknown[]>(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=500`);
    const map = source === 'madlan' ? (x: unknown) => mapMadlanItem(x as MadlanItem) : (x: unknown) => mapYad2Item(x as Yad2Item);
    return items.map(map).filter((x): x is ScannedListing => !!x);
  }

  /**
   * Keep only results that match the Settings filters. For Yad2, city is only enforced when every
   * search came from the filters (a hand-picked link may deliberately target another city).
   */
  async applyFilters(items: ScannedListing[], source: ScanSource): Promise<ScannedListing[]> {
    const { settings } = await this.store.getMeta();
    const f = settings.yad2Filters;
    if (!f) return items;
    const checkCity = source === 'madlan' || !(settings.yad2Searches ?? []).length;
    return items.filter((it) => matchesScanFilters(it, f, checkCity));
  }

  finish(source: ScanSource, runId: string, found: number, matched: number, added: number) {
    return this.setSource(source, { status: 'succeeded', runId, finishedAt: new Date().toISOString(), found, matched, added, error: undefined });
  }

  fail(source: ScanSource, runId: string | undefined, error: string) {
    return this.setSource(source, { status: 'failed', runId, finishedAt: new Date().toISOString(), error: `${source}: ${error}` });
  }
}
