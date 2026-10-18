import type { ApartmentInput, Contact, Features, ListingSource } from './types';

/**
 * Pull apartment details out of free Hebrew/English listing text – an ad
 * description, a Facebook post, or text the user copy-pasted from Yad2.
 * Only fills what it can find with reasonable confidence.
 */

const CITIES = [
  'תל אביב', 'תל-אביב', 'רמת גן', 'גבעתיים', 'ירושלים', 'חיפה', 'הרצליה', 'רעננה', 'כפר סבא', 'פתח תקווה',
  'פתח תקוה', 'ראשון לציון', 'חולון', 'בת ים', 'באר שבע', 'נתניה', 'רחובות', 'הוד השרון', 'רמת השרון',
  'מודיעין', 'אשדוד', 'אשקלון', 'קריית אונו', 'קרית אונו', 'בני ברק', 'יהוד', 'אור יהודה', 'נס ציונה',
  'ראש העין', 'כפר יונה', 'זכרון יעקב', 'חדרה', 'נהריה', 'עכו', 'קריית ביאליק', 'קריית מוצקין', 'יבנה',
  'לוד', 'רמלה', 'אילת', 'גבעת שמואל', 'שוהם', 'אבן יהודה', 'קיסריה', 'פרדס חנה',
];

const num = (s: string) => Number(s.replace(/[,\s]/g, ''));

/** Keyword → feature, with negation ("ללא חניה", "אין מעלית") respected. */
const FEATURE_WORDS: [keyof Features, RegExp][] = [
  ['safeRoom', /ממ["״']?ד|מרחב מוגן|safe room/i],
  ['parking', /חני[יה]ה?|parking/i],
  ['elevator', /מעלית|elevator/i],
  ['balcony', /מרפסת|balcony/i],
  ['airConditioning', /מזגן|מזגנים|מיזוג|a\/c|air ?condition/i],
  ['furnished', /מרוהטת|ריהוט|furnished/i],
  ['petsAllowed', /חיות מחמד|בעלי חיים|pets/i],
  ['storage', /מחסן|storage/i],
  ['accessible', /נגיש(ה|ות)?|accessib/i],
  ['renovated', /משופצת|שופצה|לאחר שיפוץ|renovated/i],
];
const NEGATION = /(ללא|אין|בלי|לא|no|without)\s*$/i;

function features(text: string): Features {
  const out: Features = {};
  for (const [key, re] of FEATURE_WORDS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) {
      const before = text.slice(Math.max(0, m.index! - 8), m.index);
      if (!NEGATION.test(before)) { out[key] = true; break; }
    }
  }
  return out;
}

function first(text: string, ...patterns: RegExp[]): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}

export function sourceFromUrl(url: string): ListingSource | undefined {
  if (/yad2/i.test(url)) return 'yad2';
  if (/facebook|fb\.com/i.test(url)) return 'facebook';
  if (/madlan/i.test(url)) return 'madlan';
  if (/homeless/i.test(url)) return 'homeless';
  return undefined;
}

export function parseListingText(raw: string): Partial<ApartmentInput> {
  const text = raw.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const out: Partial<ApartmentInput> = {};

  const price = first(
    text,
    /(?:מחיר|שכירות|שכ"ד|price)[^\d\n]{0,12}(\d{1,3}(?:,\d{3})+|\d{4,5})/i,
    /₪\s*(\d{1,3}(?:,\d{3})+|\d{4,5})/,
    /(\d{1,3}(?:,\d{3})+|\d{4,5})\s*(?:₪|ש["״]?ח|nis|שקל)/i,
  );
  if (price) out.price = num(price[1]);

  const rooms = first(
    text,
    /(\d{1,2}(?:\.5)?)\s*(?:חדרים|חדר׳|חד['׳]|חד\b|rooms?\b)/i,
    /(?:חדרים|rooms)[:\s]{1,3}(\d{1,2}(?:\.5)?)/i,
  );
  if (rooms) out.rooms = Number(rooms[1]);

  const size = first(
    text,
    /(\d{2,3})\s*(?:מ["״']?ר|מטר(?:ים)?|sqm|m2|m²)/i,
    /(?:גודל|שטח|size)[^\d\n]{0,10}(\d{2,3})/i,
  );
  if (size) out.sizeSqm = Number(size[1]);

  const floor = first(text, /קומה\s*(\d{1,2}|קרקע)(?:\s*(?:מתוך|\/)\s*(\d{1,2}))?/, /floor\s*(\d{1,2})(?:\s*(?:of|\/)\s*(\d{1,2}))?/i);
  if (floor) {
    out.floor = floor[1] === 'קרקע' ? 0 : Number(floor[1]);
    if (floor[2]) out.totalFloors = Number(floor[2]);
  }

  const arnona = text.match(/ארנונה[^\d\n]{0,15}(\d{1,3}(?:,\d{3})*|\d+)/);
  if (arnona) out.arnona = num(arnona[1]);
  const vaad = text.match(/ועד(?: בית)?[^\d\n]{0,15}(\d{1,3}(?:,\d{3})*|\d+)/);
  if (vaad) out.vaadBayit = num(vaad[1]);

  const city = CITIES.find((c) => text.includes(c));
  if (city) out.city = city.replace('-', ' ').replace('פתח תקוה', 'פתח תקווה').replace('קרית אונו', 'קריית אונו');

  const street = text.match(/(?:ברחוב|רחוב|רח['׳]|ברח['׳])\s*([א-ת"״׳'\- ]{2,24}?)\s+(\d{1,3})(?!\d)/);
  if (street) out.address = `${street[1].trim()} ${street[2]}`;

  const entry = text.match(/כניסה[^\d\n]{0,12}(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (entry) {
    const now = new Date();
    let y = entry[3] ? Number(entry[3].length === 2 ? `20${entry[3]}` : entry[3]) : now.getFullYear();
    const m = Number(entry[2]);
    const d = Number(entry[1]);
    if (!entry[3] && new Date(y, m - 1, d) < now) y += 1;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) out.entryDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  const f = features(text);
  if (Object.keys(f).length) out.features = f;

  const phones = [...new Set([...text.matchAll(/(?<!\d)(0(?:5\d|7\d|[2-489])[-\s]?\d{3}[-\s]?\d{4})(?!\d)/g)].map((m) => m[1]))];
  if (phones.length) {
    out.contacts = phones.slice(0, 2).map<Contact>((phone) => ({ id: '', role: 'contact', name: '', phone }));
  }

  return out;
}
