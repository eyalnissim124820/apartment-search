import type { Commute, GeoPoint } from '../shared/types';

/**
 * Free OpenStreetMap services:
 *  - Nominatim for geocoding (policy: ≤1 req/s, identifying User-Agent)
 *  - OSRM public demo for driving routes
 * Both URLs can be pointed at self-hosted instances via env.
 */
const NOMINATIM = process.env.GEOCODER_URL ?? 'https://nominatim.openstreetmap.org';
const OSRM = process.env.OSRM_URL ?? 'https://router.project-osrm.org';
const UA = process.env.GEO_USER_AGENT ?? 'HomeHunt/1.0 (personal apartment search app)';

let chain: Promise<unknown> = Promise.resolve();
/** Serialize geocoder calls with ≥1.1s spacing to respect Nominatim's usage policy. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, 1100)));
  return run;
}

const cache = new Map<string, GeoPoint | null>();

export async function geocode(query: string): Promise<GeoPoint | null> {
  const q = query.trim();
  if (!q) return null;
  if (cache.has(q)) return cache.get(q)!;
  const point = await throttled(async () => {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=1&countrycodes=il&accept-language=he&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  });
  cache.set(q, point);
  return point;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function driveTime(from: GeoPoint, to: GeoPoint): Promise<Commute> {
  try {
    const url = `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
    const json = (await res.json()) as { code: string; routes?: { duration: number; distance: number }[] };
    const r = json.routes?.[0];
    if (json.code !== 'Ok' || !r) throw new Error(json.code);
    return { minutes: Math.round(r.duration / 60), km: Math.round(r.distance / 100) / 10 };
  } catch {
    // Rough urban estimate: roads ≈ 1.35× straight line at ~28 km/h average.
    const km = haversineKm(from, to) * 1.35;
    return { minutes: Math.max(1, Math.round((km / 28) * 60)), km: Math.round(km * 10) / 10, estimated: true };
  }
}
