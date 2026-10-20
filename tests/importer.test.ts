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
  assert.equal(r.title, 'דירה להשכרה, 3 חדרים, בזל 12, תל אביב');
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
