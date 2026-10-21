import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFromHtml, importFromText } from '../server/importer.js';
import { parseListingText } from '../shared/parseListing.js';

// Shape modelled on Yad2 item pages: Next.js state with the main item plus "similar" listings.
const yad2Html = `<!doctype html><html><head>
<meta property="og:title" content="דירה להשכרה, 3 חדרים, בזל 12, תל אביב | יד2" />
<meta property="og:description" content="דירה מקסימה ומוארת, ממ&quot;ד, ללא חניה" />
<meta property="og:image" content="https://img.yad2.co.il/Pic/a.jpeg" />
</head><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { dehydratedState: { queries: [
    { state: { data: {
      price: 7800,
      address: { city: { text: 'תל אביב יפו' }, neighborhood: { text: 'הצפון הישן' }, street: { text: 'בזל' }, house: { number: 12, floor: 2 } },
      additionalDetails: { roomsCount: 3, squareMeter: 72, buildingTopFloor: 4 },
      inProperty: { includeParking: false, includeElevator: true, includeSecurityRoom: true, includeAirconditioner: true },
      metaData: { images: ['https://img.yad2.co.il/Pic/a.jpeg', 'https://img.yad2.co.il/Pic/b.jpeg'], description: 'דירה מקסימה ומוארת, קרובה לפארק הירקון ולתחבורה ציבורית' },
    } } },
    { state: { data: { similar: [{ price: 5100, address: { city: { text: 'חולון' } } }] } } },
  ] } } },
})}</script></body></html>`;

test('extracts Yad2-style embedded state', () => {
  const r = extractFromHtml(yad2Html, 'https://www.yad2.co.il/realestate/item/abc');
  assert.equal(r.price, 7800);
  assert.equal(r.rooms, 3);
  assert.equal(r.sizeSqm, 72);
  assert.equal(r.floor, 2);
  assert.equal(r.city, 'תל אביב יפו');
  assert.equal(r.neighborhood, 'הצפון הישן');
  assert.equal(r.address, 'בזל 12');
  assert.equal(r.source, 'yad2');
  assert.deepEqual(r.images, ['https://img.yad2.co.il/Pic/a.jpeg', 'https://img.yad2.co.il/Pic/b.jpeg']);
  assert.equal(r.features?.elevator, true);
  assert.equal(r.features?.safeRoom, true);
  assert.equal(r.features?.parking, undefined);
  assert.equal(r.title, '3 חד׳ בבזל 12, תל אביב יפו');
});

const madlanHtml = `<html><head><title>דירה להשכרה ברמת גן - מדלן</title></head><body>
<script>window.__APOLLO_STATE__ = ${JSON.stringify({
  'Poi:1': { __typename: 'BulletinPoi', price: 6500, beds: 2.5, area: 60, floor: 0, address: 'ביאליק 40, רמת גן',
    images: [{ imageUrl: 'https://images2.madlan.co.il/t:nonce:x/b.jpg' }] },
})};</script></body></html>`;

test('extracts Madlan-style Apollo state', () => {
  const r = extractFromHtml(madlanHtml, 'https://www.madlan.co.il/listings/xyz');
  assert.equal(r.price, 6500);
  assert.equal(r.rooms, 2.5);
  assert.equal(r.sizeSqm, 60);
  assert.equal(r.source, 'madlan');
  assert.equal(r.images?.[0], 'https://images2.madlan.co.il/t:nonce:x/b.jpg');
  assert.equal(r.city, 'רמת גן'); // from title text
});

test('extracts JSON-LD', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Apartment', name: 'Nice flat', numberOfRooms: 4, floorSize: { value: 95 },
    address: { addressLocality: 'Haifa', streetAddress: 'Herzl 5' }, offers: { price: '5,900' },
  })}</script>`;
  const r = extractFromHtml(html, 'https://example.com/x');
  assert.equal(r.rooms, 4);
  assert.equal(r.sizeSqm, 95);
  assert.equal(r.price, 5900);
  assert.equal(r.city, 'Haifa');
  assert.equal(r.address, 'Herzl 5');
});

test('parses pasted Hebrew ad text', () => {
  const r = parseListingText(`להשכרה בגבעתיים! 3.5 חדרים ברחוב כצנלסון 42, קומה 3 מתוך 5, 85 מ"ר.
מחיר: 7,200 ₪, ארנונה 520, ועד בית 180. מעלית, ממ״ד, מרפסת שמש, אין חניה.
כניסה 1/12/2026. לפרטים: דנה 054-1234567`);
  assert.equal(r.rooms, 3.5);
  assert.equal(r.address, 'כצנלסון 42');
  assert.equal(r.floor, 3);
  assert.equal(r.totalFloors, 5);
  assert.equal(r.sizeSqm, 85);
  assert.equal(r.price, 7200);
  assert.equal(r.arnona, 520);
  assert.equal(r.vaadBayit, 180);
  assert.equal(r.city, 'גבעתיים');
  assert.equal(r.entryDate, '2026-12-01');
  assert.deepEqual(r.features, { safeRoom: true, elevator: true, balcony: true });
  assert.equal(r.contacts?.[0].phone, '054-1234567');
});

test('flags empty results', () => {
  assert.equal(importFromText('hello').warning, 'empty');
  assert.equal(importFromText('דירת 2 חדרים 5000 ש"ח').warning, undefined);
});

test('suggests a title for pasted text', () => {
  const r = importFromText('3 חדרים ברחוב ביאליק 40 רמת גן, 6,500 ₪');
  assert.equal(r.data.title, '3 חד׳ בביאליק 40, רמת גן');
});

test('treats a bot-wall page as blocked', async () => {
  const { importFromUrl } = await import('../server/importer.js');
  const html = '<html><head><title>Radware Page</title><meta name="description" content="Loader page."></head></html>';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(html, { status: 200 })) as typeof fetch;
  try {
    const r = await importFromUrl('https://www.yad2.co.il/realestate/item/x');
    assert.equal(r.warning, 'blocked');
    assert.equal(r.data.title, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('cleans Facebook titles: hex entities, group name, ** and site suffix', async () => {
  const { cleanTitle } = await import('../server/importer.js');
  const raw = '&#x5d3;&#x5d9;&#x5e8;&#x5d5;&#x5ea; &#x5de;&#x5e4;&#x5d4; &#x5dc;&#x5d0;&#x5d5;&#x5d6;&#x5df; | **&#x5dc;&#x5d4;&#x5e9;&#x5db;&#x5e8;&#x5d4;! &#x5d3;&#x5d9;&#x5e8;&#x5d4; 3 &#x5d7;&#x5d3;&#x5e8;&#x5d9;&#x5dd; ** | Facebook';
  assert.equal(cleanTitle(raw), 'להשכרה! דירה 3 חדרים');
  const html = `<meta property="og:title" content="${raw}" /><meta property="og:description" content="**&#x5dc;&#x5d4;&#x5e9;&#x5db;&#x5e8;&#x5d4;** &#x5d1;&#x5ea;&#x5dc; &#x5d0;&#x5d1;&#x5d9;&#x5d1;" />`;
  const r = extractFromHtml(html, 'https://www.facebook.com/share/p/x');
  assert.equal(r.title, '3 חד׳ בתל אביב');
  assert.equal(r.description, 'להשכרה בתל אביב');
  assert.equal(r.source, 'facebook');
});

test('falls back to ScrapingBee when the direct fetch hits a bot wall', async () => {
  const { importFromUrl } = await import('../server/importer.js');
  const wall = '<html><head><title>Radware Page</title></head></html>';
  const listing = '<meta property="og:title" content="דירה להשכרה, 3 חדרים, בזל 12, תל אביב | יד2" />'
    + '<meta property="og:description" content="מחיר 7,800 ₪, 72 מ&quot;ר" />';
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  process.env.SCRAPINGBEE_API_KEY = 'test-key';
  globalThis.fetch = (async (input: string | URL) => {
    const u = String(input);
    calls.push(u.includes('scrapingbee') ? (u.includes('stealth') ? 'stealth' : 'premium') : 'direct');
    return new Response(u.includes('scrapingbee') ? listing : wall, { status: 200 });
  }) as typeof fetch;
  try {
    const r = await importFromUrl('https://www.yad2.co.il/realestate/item/abc');
    assert.equal(r.warning, undefined);
    assert.equal(r.data.price, 7800);
    assert.deepEqual(calls, ['direct', 'premium']);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SCRAPINGBEE_API_KEY;
  }
});
