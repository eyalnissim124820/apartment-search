import type { Apartment, ApartmentInput, Features, ScanStatus } from '../shared/types.js';
import { geoQuery } from '../shared/workflow.js';
import { suggestTitle } from './importer.js';
import type { Store } from './store/Store.js';

/**
 * Automatic Yad2 search scan through Apify (actor amit123/YadScraper by default).
 *
 * Flow (works inside Vercel's 60s function limit because nothing waits on the scrape):
 *   start()         → POST /v2/acts/{actor}/runs with an ad-hoc webhook pointing back at us
 *   Apify finishes  → POST /api/apify/webhook?secret=…  → handleRunFinished()
 *                   → read the run's dataset → map items → caller imports the new ones
 *
 * Env: APIFY_TOKEN (required), APIFY_YAD2_ACTOR, APIFY_YAD2_MAX_ITEMS, APIFY_MAX_CHARGE_USD (optional).
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

export class Yad2Scanner {
  constructor(private readonly store: Store) {}

  private async setStatus(patch: Partial<ScanStatus> & Pick<ScanStatus, 'status'>) {
    const meta = await this.store.getMeta();
    meta.scan = { ...meta.scan, startedAt: meta.scan?.startedAt ?? new Date().toISOString(), ...patch } as ScanStatus;
    await this.store.saveMeta(meta);
    return meta.scan;
  }

  /** Start one actor run over all saved searches. `baseUrl` is this app's public origin, for the webhook. */
  async start(baseUrl: string): Promise<ScanStatus> {
    if (!scanConfigured()) throw new Error('APIFY_TOKEN is not set');
    const meta = await this.store.getMeta();
    const searches = meta.settings.yad2Searches ?? [];
    if (!searches.length) throw new Error('No Yad2 searches saved');
    // Don't stack runs: a scan that started < 15 minutes ago is still considered in progress.
    if (meta.scan?.status === 'running' && Date.now() - new Date(meta.scan.startedAt).getTime() < 15 * 60_000) {
      return meta.scan;
    }

    const maxItems = MAX_ITEMS() * searches.length;
    const input = {
      start_urls: searches.map((s) => ({ url: s.url })),
      maxPagesPerSearch: 1,
      // one list page + one detail page per result, per search
      maxRequestsPerCrawl: searches.length * (MAX_ITEMS() + 1),
      proxy: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'IL' },
    };
    const secret = encodeURIComponent(process.env.CRON_SECRET ?? '');
    const webhooks = Buffer.from(
      JSON.stringify([
        {
          eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'],
          requestUrl: `${baseUrl}/api/apify/webhook?secret=${secret}`,
        },
      ]),
    ).toString('base64');
    const qs = new URLSearchParams({
      timeout: '600',
      maxItems: String(maxItems),
      maxTotalChargeUsd: String(MAX_CHARGE()),
      webhooks,
    });
    const { data } = await apify<{ data: ApifyRun }>(`/acts/${ACTOR()}/runs?${qs}`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return this.setStatus({ status: 'running', startedAt: new Date().toISOString(), runId: data.id, error: undefined, found: undefined, added: undefined, finishedAt: undefined });
  }

  /** Called from the webhook. Returns mapped items to import, or null if the run didn't succeed / was handled. */
  async collect(runId: string): Promise<ScannedListing[] | null> {
    const meta = await this.store.getMeta();
    if (meta.scan?.runId === runId && meta.scan.status !== 'running') return null; // duplicate delivery
    const { data: run } = await apify<{ data: ApifyRun }>(`/actor-runs/${runId}`);
    if (run.status !== 'SUCCEEDED') {
      await this.setStatus({ status: 'failed', runId, finishedAt: new Date().toISOString(), error: `Run ${run.status}` });
      return null;
    }
    const items = await apify<Yad2Item[]>(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=500`);
    return items.map(mapYad2Item).filter((x): x is NonNullable<typeof x> => !!x);
  }

  finish(runId: string, found: number, added: number) {
    return this.setStatus({ status: 'succeeded', runId, finishedAt: new Date().toISOString(), found, added });
  }

  fail(runId: string | undefined, error: string) {
    return this.setStatus({ status: 'failed', runId, finishedAt: new Date().toISOString(), error });
  }
}
