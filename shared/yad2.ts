import type { ApartmentInput, Features, ScanFilters } from './types.js';

export type { ScanFilters };

/** Cities offered in Settings. Codes are the CBS settlement codes Yad2 uses in its `city` parameter. */
/** `madlan` is the name the Madlan scraper expects (it matches English or Hebrew names). */
export const YAD2_CITIES: { code: string; he: string; en: string; madlan: string }[] = [
  { code: '5000', he: 'תל אביב יפו', en: 'Tel Aviv-Yafo', madlan: 'Tel Aviv' },
  { code: '8600', he: 'רמת גן', en: 'Ramat Gan', madlan: 'Ramat Gan' },
  { code: '6300', he: 'גבעתיים', en: 'Givatayim', madlan: 'Givatayim' },
  { code: '6400', he: 'הרצליה', en: 'Herzliya', madlan: 'Herzliya' },
  { code: '2650', he: 'רמת השרון', en: 'Ramat HaSharon', madlan: 'Ramat Hasharon' },
  { code: '6600', he: 'חולון', en: 'Holon', madlan: 'Holon' },
  { code: '6200', he: 'בת ים', en: 'Bat Yam', madlan: 'Bat Yam' },
  { code: '2620', he: 'קריית אונו', en: 'Kiryat Ono', madlan: 'Kiryat Ono' },
  { code: '681', he: 'גבעת שמואל', en: "Giv'at Shmuel", madlan: 'Givat Shmuel' },
  { code: '7900', he: 'פתח תקווה', en: 'Petah Tikva', madlan: 'Petah Tikva' },
  { code: '8300', he: 'ראשון לציון', en: 'Rishon LeZion', madlan: 'Rishon Lezion' },
  { code: '8700', he: 'רעננה', en: "Ra'anana", madlan: 'Raanana' },
  { code: '6900', he: 'כפר סבא', en: 'Kfar Saba', madlan: 'Kfar Saba' },
  { code: '9700', he: 'הוד השרון', en: 'Hod HaSharon', madlan: 'Hod Hasharon' },
  { code: '7400', he: 'נתניה', en: 'Netanya', madlan: 'Netanya' },
  { code: '8400', he: 'רחובות', en: 'Rehovot', madlan: 'Rehovot' },
  { code: '1200', he: 'מודיעין', en: "Modi'in", madlan: 'Modiin' },
  { code: '3000', he: 'ירושלים', en: 'Jerusalem', madlan: 'Jerusalem' },
  { code: '4000', he: 'חיפה', en: 'Haifa', madlan: 'Haifa' },
  { code: '9000', he: 'באר שבע', en: "Be'er Sheva", madlan: 'Beer Sheva' },
];

/** Features worth filtering on in a search. */
export const SCAN_FEATURES: (keyof Features)[] = [
  'safeRoom', 'parking', 'elevator', 'balcony', 'airConditioning', 'petsAllowed', 'furnished',
];

export function buildYad2SearchUrl(cityCode: string, f: ScanFilters): string {
  const qs = new URLSearchParams({ city: cityCode });
  if (f.minPrice) qs.set('minPrice', String(f.minPrice));
  if (f.maxPrice) qs.set('maxPrice', String(f.maxPrice));
  if (f.minRooms) qs.set('minRooms', String(f.minRooms));
  if (f.maxRooms) qs.set('maxRooms', String(f.maxRooms));
  if (f.minSize) qs.set('minSquaremeter', String(f.minSize));
  if (f.mustHave?.includes('parking')) qs.set('parking', '1');
  if (f.mustHave?.includes('elevator')) qs.set('elevator', '1');
  return `https://www.yad2.co.il/realestate/rent?${qs}`;
}

const norm = (s: string) => s.replace(/[-–־"'״׳.,]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Does a scanned listing satisfy the filters? Unknown values (e.g. no size given) pass,
 * so we don't drop good listings just because the ad left a field empty.
 */
export function matchesScanFilters(a: Partial<ApartmentInput>, f: ScanFilters, checkCity = true): boolean {
  if (a.price != null) {
    if (f.minPrice && a.price < f.minPrice) return false;
    if (f.maxPrice && a.price > f.maxPrice) return false;
  }
  if (a.rooms != null) {
    if (f.minRooms && a.rooms < f.minRooms) return false;
    if (f.maxRooms && a.rooms > f.maxRooms) return false;
  }
  if (a.sizeSqm != null && f.minSize && a.sizeSqm < f.minSize) return false;

  if (checkCity && f.cities.length && a.city) {
    const names = f.cities
      .map((c) => YAD2_CITIES.find((x) => x.code === c))
      .filter(Boolean)
      .flatMap((c) => [c!.he, c!.en, c!.he.split(' ').slice(0, 2).join(' ')]);
    const city = norm(a.city);
    if (names.length && !names.some((n) => city.includes(norm(n)) || norm(n).includes(city))) return false;
  }

  const hoods = (f.neighborhoods ?? []).map(norm).filter(Boolean);
  if (hoods.length) {
    const where = norm([a.neighborhood, a.address, a.description].filter(Boolean).join(' '));
    if (!hoods.some((h) => where.includes(h))) return false;
  }

  for (const feat of f.mustHave ?? []) if (!a.features?.[feat]) return false;
  return true;
}
