import type { ApartmentInput, Features, ImportResult } from '../shared/types.js';
import { parseListingText, sourceFromUrl } from '../shared/parseListing.js';

/**
 * Best-effort listing import. Tries, in order of reliability:
 *  1. structured app state embedded in the page (__NEXT_DATA__, Apollo state…)
 *  2. schema.org JSON-LD
 *  3. Open Graph tags + free-text parsing of title/description
 * Yad2 and Madlan run bot protection, so a fetch may get a captcha page; we
 * report that as `blocked` and the client offers paste-the-text instead.
 */

const BLOCK_MARKERS = /shieldsquare|perfdrive|captcha|are you a robot|radware|cf-chl|bot detection/i;

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

function metaTags(html: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (key && content) (out[key] ??= []).push(decode(content));
  }
  return out;
}

function jsonScripts(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = m;
    const isJson = /application\/(ld\+)?json/i.test(attrs) || /id=["']__NEXT_DATA__["']/i.test(attrs);
    let src = body.trim();
    if (!isJson) {
      // window.__APOLLO_STATE__ = {...}; and similar inline state blobs
      const assign = src.match(/^window\.__[A-Z_]+__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
      if (!assign) continue;
      src = assign[1];
    }
    try { out.push(JSON.parse(src)); } catch { /* not JSON */ }
  }
  return out;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const KEYS = {
  price: ['price', 'monthlyPrice', 'rentPrice'],
  rooms: ['roomsCount', 'rooms', 'numberOfRooms', 'beds', 'roomCount'],
  sizeSqm: ['squareMeter', 'squareMeters', 'squareMeterBuild', 'area', 'builtArea', 'size', 'floorSize'],
  floor: ['floor', 'floorNumber'],
  totalFloors: ['totalFloors', 'buildingFloors', 'floors', 'numberOfFloors'],
  city: ['city', 'cityName', 'addressLocality', 'settlement'],
  neighborhood: ['neighborhood', 'neighborhoodName', 'neighbourhood'],
  street: ['street', 'streetName', 'streetAddress'],
  house: ['houseNumber', 'house', 'number'],
  description: ['description', 'searchText', 'info'],
} as const;
const ALL_KEYS = new Set<string>(Object.values(KEYS).flat());

/** Yad2's in-property flags and similar booleans. */
const FEATURE_FLAGS: [RegExp, keyof Features][] = [
  [/parking/i, 'parking'],
  [/elevator/i, 'elevator'],
  [/security.?room|mamad|safe.?room|shelter/i, 'safeRoom'],
  [/balcon/i, 'balcony'],
  [/air.?condition/i, 'airConditioning'],
  [/furni/i, 'furnished'],
  [/pet/i, 'petsAllowed'],
  [/warehouse|storage/i, 'storage'],
  [/handicap|accessib/i, 'accessible'],
  [/renovat/i, 'renovated'],
];

/** Read "Tel Aviv", { text: "Tel Aviv" }, { name: … } or { value: 72 } style values. */
function scalar(v: unknown): string | number | undefined {
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (isObj(v)) for (const k of ['text', 'name', 'value', 'title', 'number']) {
    const s = v[k];
    if (typeof s === 'string' || typeof s === 'number') return s;
  }
  return undefined;
}

const toNum = (v: unknown) => {
  const s = scalar(v);
  const n = typeof s === 'number' ? s : s != null ? Number(String(s).replace(/[^\d.]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Find the object that looks most like "the listing": the one with the most listing-ish keys nearby. */
function bestCandidate(root: unknown): Obj | undefined {
  let best: { obj: Obj; score: number } | undefined;
  const seen = new Set<unknown>();
  const score = (o: Obj, depth = 0): number => {
    let s = 0;
    for (const [k, v] of Object.entries(o)) {
      if (ALL_KEYS.has(k) && scalar(v) != null) s++;
      if (depth < 2 && isObj(v)) s += score(v, depth + 1) * 0.5;
    }
    return s;
  };
  const walk = (v: unknown, depth: number) => {
    if (depth > 14 || !v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    const s = score(v as Obj);
    if (s >= 3 && (!best || s > best.score)) best = { obj: v as Obj, score: s };
    for (const x of Object.values(v)) walk(x, depth + 1);
  };
  walk(root, 0);
  return best?.obj;
}

/** First value for any of `keys` within `obj`, searching breadth-first a few levels down. */
function pick(obj: Obj, keys: readonly string[], maxDepth = 3): unknown {
  let level: Obj[] = [obj];
  for (let d = 0; d <= maxDepth && level.length; d++) {
    for (const o of level) for (const k of keys) if (o[k] != null && scalar(o[k]) != null) return o[k];
    level = level.flatMap((o) => Object.values(o).filter(isObj));
  }
  return undefined;
}

function images(obj: Obj): string[] {
  const out = new Set<string>();
  // Collect image URLs that sit somewhere under an image-ish key.
  const walk = (v: unknown, depth: number, underImageKey: boolean) => {
    if (depth > 6 || out.size >= 12) return;
    if (typeof v === 'string') {
      if (underImageKey && /^https?:\/\/[^\s"]+\.(?:jpe?g|png|webp)(?:\?[^\s"]*)?$/i.test(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1, underImageKey));
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, depth + 1, underImageKey || /image|photo|picture|media/i.test(k));
  };
  walk(obj, 0, false);
  return [...out];
}

function featureFlags(obj: Obj): Features {
  const out: Features = {};
  const walk = (o: Obj, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === true) for (const [re, f] of FEATURE_FLAGS) if (re.test(k)) out[f] = true;
      if (isObj(v) && depth < 3) walk(v, depth + 1);
    }
  };
  walk(obj, 0);
  return out;
}

export function extractStructured(root: unknown): Partial<ApartmentInput> {
  const c = bestCandidate(root);
  if (!c) return {};
  const out: Partial<ApartmentInput> = {};
  const price = toNum(pick(c, KEYS.price));
  if (price && price > 500 && price < 100000) out.price = price;
  const rooms = toNum(pick(c, KEYS.rooms));
  if (rooms && rooms <= 15) out.rooms = rooms;
  const size = toNum(pick(c, KEYS.sizeSqm));
  if (size && size >= 10 && size < 1000) out.sizeSqm = size;
  const floorRaw = scalar(pick(c, KEYS.floor));
  if (floorRaw === 0 || floorRaw === '0' || floorRaw === 'קרקע') out.floor = 0;
  else if (toNum(floorRaw) != null) out.floor = toNum(floorRaw);
  const totalFloors = toNum(pick(c, KEYS.totalFloors));
  if (totalFloors && totalFloors < 100) out.totalFloors = totalFloors;
  const str = (keys: readonly string[]) => {
    const v = scalar(pick(c, keys));
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  out.city = str(KEYS.city);
  out.neighborhood = str(KEYS.neighborhood);
  const street = str(KEYS.street);
  if (street) {
    const house = scalar(pick(c, KEYS.house));
    out.address = house != null && !street.match(/\d/) ? `${street} ${house}` : street;
  }
  const desc = str(KEYS.description);
  if (desc && desc.length > 20) out.description = desc;
  const imgs = images(c);
  if (imgs.length) out.images = imgs;
  const f = featureFlags(c);
  if (Object.keys(f).length) out.features = f;
  for (const k of Object.keys(out) as (keyof ApartmentInput)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** Merge, keeping values from earlier (more reliable) sources. */
function merge(...parts: Partial<ApartmentInput>[]): Partial<ApartmentInput> {
  const out: Partial<ApartmentInput> = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p) as [keyof ApartmentInput, unknown][]) {
      if (v == null || v === '') continue;
      if (k === 'features') out.features = { ...(v as Features), ...out.features };
      else if (out[k] == null) (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

export function extractFromHtml(html: string, url: string): Partial<ApartmentInput> {
  const meta = metaTags(html);
  const title = meta['og:title']?.[0] ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const description = meta['og:description']?.[0] ?? meta['description']?.[0] ?? '';
  const ogImages = (meta['og:image'] ?? []).filter((u) => /^https?:/.test(u));

  const structured = merge(...jsonScripts(html).map(extractStructured));
  const fromText = parseListingText(`${title}\n${description}\n${structured.description ?? ''}`);

  const cleanTitle = title.replace(/\s*[|\-–]\s*(יד ?2|yad2|מדלן|madlan).*$/i, '').trim();
  const result = merge(
    structured,
    { title: cleanTitle || undefined, description: description || undefined, images: ogImages.length ? ogImages : undefined },
    fromText,
  );
  result.title ??= suggestTitle(result);
  result.listingUrl = url;
  result.source = sourceFromUrl(url) ?? 'other';
  if (result.images) result.images = [...new Set(result.images)].slice(0, 10);
  return result;
}

const IMPORTANT: (keyof ApartmentInput)[] = ['price', 'rooms', 'sizeSqm', 'city', 'address', 'images'];

function summarize(data: Partial<ApartmentInput>, warning?: ImportResult['warning']): ImportResult {
  const found = (Object.keys(data) as (keyof ApartmentInput)[]).filter((k) => !['listingUrl', 'source'].includes(k));
  if (!warning && !IMPORTANT.some((k) => data[k] != null)) warning = 'empty';
  return { data, found, warning };
}

export async function importFromUrl(url: string): Promise<ImportResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error('Invalid URL');
  const base = { listingUrl: url, source: sourceFromUrl(url) ?? 'other' } as const;
  let html: string;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
    });
    html = await res.text();
    if (res.status === 403 || res.status === 429 || (BLOCK_MARKERS.test(html) && !/og:title/i.test(html))) {
      return summarize(base, 'blocked');
    }
  } catch {
    return summarize(base, 'blocked');
  }
  return summarize(extractFromHtml(html, url));
}

/** "3.5 חד׳ בכצנלסון 42, גבעתיים" – a readable default when the source had no title. */
export function suggestTitle(d: Partial<ApartmentInput>): string | undefined {
  const where = [d.address ?? d.neighborhood, d.city].filter(Boolean).join(', ');
  if (!d.rooms && !where) return undefined;
  return [d.rooms ? `${d.rooms} חד׳` : 'דירה', where && `ב${where}`].filter(Boolean).join(' ');
}

export function importFromText(text: string, url?: string): ImportResult {
  const data = parseListingText(text);
  if (url) Object.assign(data, { listingUrl: url, source: sourceFromUrl(url) ?? 'other' });
  if (text.trim().length > 30) data.description = text.trim().slice(0, 4000);
  data.title = suggestTitle(data);
  return summarize(data);
}
