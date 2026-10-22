import type { Contact, Features, ScanFilters } from '../shared/types.js';
import { geoQuery } from '../shared/workflow.js';
import { YAD2_CITIES } from '../shared/yad2.js';
import { suggestTitle } from './importer.js';
import type { ScannedListing } from './yad2Scan.js';

/**
 * Madlan via the Apify actor swerve/madlan-scraper (override with APIFY_MADLAN_ACTOR).
 * Unlike the Yad2 actor it takes filters directly instead of search URLs.
 */

export const MADLAN_ACTOR = () => (process.env.APIFY_MADLAN_ACTOR ?? 'swerve/madlan-scraper').replace('/', '~');

/** Actor input for our Settings filters. `perCity` caps results (the actor charges per result). */
export function madlanInput(f: ScanFilters, perCity: number) {
  const cities = f.cities.map((c) => YAD2_CITIES.find((x) => x.code === c)?.madlan).filter(Boolean);
  return {
    city: cities.join(', '),
    dealType: 'rent',
    maxItems: perCity,
    ...(f.minPrice ? { minPrice: f.minPrice } : {}),
    ...(f.maxPrice ? { maxPrice: f.maxPrice } : {}),
    ...(f.minRooms ? { minRooms: f.minRooms } : {}),
    ...(f.maxRooms ? { maxRooms: f.maxRooms } : {}),
    ...(f.mustHave?.includes('parking') ? { requireParking: true } : {}),
    ...(f.mustHave?.includes('elevator') ? { requireElevator: true } : {}),
    ...(f.mustHave?.includes('balcony') ? { requireBalcony: true } : {}),
    ...(f.mustHave?.includes('safeRoom') ? { requireSecureRoom: true } : {}),
  };
}

/** Raw dataset item, per the actor's README. Everything optional – be defensive. */
export interface MadlanItem {
  id?: string;
  url?: string;
  dealType?: string;
  city?: string;
  cityHebrew?: string;
  neighbourhood?: string;
  address?: string;
  streetName?: string;
  streetNumber?: string | number;
  price?: number | string;
  rooms?: number | string;
  floor?: number | string;
  areaSqm?: number | string;
  condition?: string;
  parking?: number | boolean;
  hasElevator?: boolean;
  hasBalcony?: boolean;
  hasSecureRoom?: boolean;
  images?: (string | { url?: string })[];
  contactName?: string;
  contactPhone?: string;
  contactType?: string;
  hasAgent?: boolean;
  // Coordinates are mentioned in the README but not in its output table; accept common shapes.
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  location?: { lat?: number; lng?: number; lon?: number };
  [k: string]: unknown;
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function mapMadlanItem(it: MadlanItem): ScannedListing | null {
  const id = it.id ?? it.url?.match(/listings\/([^/?#]+)/)?.[1];
  if (!id || (it.dealType && it.dealType !== 'rent')) return null;

  const street = [it.streetName, it.streetNumber].filter((x) => x != null && x !== '').join(' ').trim();
  const address = street || it.address?.split(',')[0]?.trim() || undefined;
  const floorRaw = String(it.floor ?? '').trim();

  const features: Features = {};
  if (typeof it.parking === 'number' ? it.parking > 0 : it.parking) features.parking = true;
  if (it.hasElevator) features.elevator = true;
  if (it.hasBalcony) features.balcony = true;
  if (it.hasSecureRoom) features.safeRoom = true;
  if (/משופצ|renovat/i.test(it.condition ?? '')) features.renovated = true;

  const contacts: Contact[] = it.contactPhone
    ? [{ id: '', role: it.hasAgent ? 'agent' : 'contact', name: it.contactName ?? '', phone: it.contactPhone }]
    : [];

  const out: ScannedListing = {
    externalId: `madlan:${id}`,
    title: '',
    listingUrl: it.url ?? `https://www.madlan.co.il/listings/${id}`,
    source: 'madlan',
    price: num(it.price),
    rooms: num(it.rooms),
    sizeSqm: num(it.areaSqm),
    floor: /^0$|קרקע|ground/i.test(floorRaw) ? 0 : num(floorRaw),
    city: it.cityHebrew || it.city,
    neighborhood: it.neighbourhood || undefined,
    address,
    description: [it.condition, it.hasAgent ? 'תיווך' : undefined].filter(Boolean).join(' · ') || undefined,
    images: (it.images ?? [])
      .map((x) => (typeof x === 'string' ? x : x?.url))
      .filter((x): x is string => typeof x === 'string' && /^https?:\/\//.test(x))
      .slice(0, 10),
    features,
    contacts,
  };

  const lat = it.lat ?? it.latitude ?? it.location?.lat;
  const lng = it.lng ?? it.longitude ?? it.location?.lng ?? it.location?.lon;
  if (typeof lat === 'number' && typeof lng === 'number') out.geo = { lat, lng, query: geoQuery(out) };

  out.title = suggestTitle(out) ?? (out.city ? `דירה ב${out.city}` : 'דירה ממדלן');
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined) delete out[k];
  return out;
}
