import { test } from 'node:test';
import assert from 'node:assert/strict';
import { madlanInput, mapMadlanItem } from '../server/madlanScan.js';
import { mapYad2Item } from '../server/yad2Scan.js';
import { ApartmentService } from '../server/service.js';
import { emptyMeta, type Meta, type Store } from '../server/store/Store.js';
import type { Apartment } from '../shared/types.js';

// From the swerve/madlan-scraper README example output.
const item = {
  id: 'gd93kf2m',
  url: 'https://www.madlan.co.il/listings/gd93kf2m',
  dealType: 'rent',
  city: 'Tel Aviv',
  cityHebrew: 'תל אביב יפו',
  neighbourhood: 'הצפון הישן',
  address: 'דיזנגוף 204, תל אביב יפו',
  streetName: 'דיזנגוף',
  streetNumber: '204',
  price: 6500,
  currency: 'ILS',
  rooms: 3,
  floor: '4',
  areaSqm: 72,
  condition: 'משופצת',
  parking: 1,
  hasElevator: true,
  hasBalcony: true,
  hasSecureRoom: false,
  images: ['https://images2.madlan.co.il/a.webp'],
  contactName: 'David',
  contactPhone: '054-1234567',
  contactType: 'private',
  hasAgent: false,
};

test('maps a Madlan result to an apartment', () => {
  const a = mapMadlanItem(item)!;
  assert.equal(a.externalId, 'madlan:gd93kf2m');
  assert.equal(a.source, 'madlan');
  assert.equal(a.title, '3 חד׳ בדיזנגוף 204, תל אביב יפו');
  assert.equal(a.address, 'דיזנגוף 204');
  assert.equal(a.city, 'תל אביב יפו');
  assert.equal(a.neighborhood, 'הצפון הישן');
  assert.equal(a.price, 6500);
  assert.equal(a.sizeSqm, 72);
  assert.equal(a.floor, 4);
  assert.deepEqual(a.features, { parking: true, elevator: true, balcony: true, renovated: true });
  assert.deepEqual(a.contacts, [{ id: '', role: 'contact', name: 'David', phone: '054-1234567' }]);
  assert.equal(mapMadlanItem({ ...item, dealType: 'buy' }), null);
});

test('builds Madlan actor input from the filters', () => {
  assert.deepEqual(
    madlanInput({ cities: ['5000', '8600'], maxPrice: 9000, minRooms: 3, mustHave: ['safeRoom', 'parking', 'petsAllowed'] }, 20),
    { city: 'Tel Aviv, Ramat Gan', dealType: 'rent', maxItems: 20, maxPrice: 9000, minRooms: 3, requireParking: true, requireSecureRoom: true },
  );
});

class MemoryStore implements Store {
  apts = new Map<string, Apartment>();
  meta: Meta = emptyMeta();
  async list() { return [...this.apts.values()]; }
  async get(id: string) { return this.apts.get(id); }
  async save(a: Apartment) { this.apts.set(a.id, structuredClone(a)); }
  async remove(id: string) { return this.apts.delete(id); }
  async getMeta() { return structuredClone(this.meta); }
  async saveMeta(m: Meta) { this.meta = structuredClone(m); }
}

test('the same flat on Yad2 and Madlan is imported once', async () => {
  const svc = new ApartmentService(new MemoryStore());
  const onYad2 = mapYad2Item({ item_id: 'y1', location: 'דיזנגוף 204, הצפון הישן, תל אביב יפו', price: 6500, rooms: 3 })!;
  const first = await svc.importExternal([onYad2]);
  assert.equal(first.length, 1);
  const second = await svc.importExternal([mapMadlanItem(item)!]);
  assert.equal(second.length, 0);
  // A different flat in the same building (other price) still comes in.
  const third = await svc.importExternal([mapMadlanItem({ ...item, id: 'other', url: undefined, price: 7200 })!]);
  assert.equal(third.length, 1);
});

import { Yad2Scanner } from '../server/yad2Scan.js';

test('a scan starts one run per source and combines their status', async () => {
  const store = new MemoryStore();
  store.meta.settings = { work: {}, yad2Filters: { cities: ['5000'] }, scanSources: ['yad2', 'madlan'] };
  const started: string[] = [];
  const realFetch = globalThis.fetch;
  process.env.APIFY_TOKEN = 'test';
  globalThis.fetch = (async (input: string | URL) => {
    const u = String(input);
    const actor = u.match(/acts\/([^/]+)\/runs/)?.[1];
    started.push(actor ?? u);
    const hook = JSON.parse(Buffer.from(new URL(u).searchParams.get('webhooks')!, 'base64').toString());
    assert.match(hook[0].requestUrl, actor === 'swerve~madlan-scraper' ? /source=madlan/ : /source=yad2/);
    return new Response(JSON.stringify({ data: { id: `run-${actor}` } }), { status: 201 });
  }) as typeof fetch;
  try {
    const scanner = new Yad2Scanner(store);
    const s = await scanner.start('https://app.example');
    assert.deepEqual(started, ['amit123~YadScraper', 'swerve~madlan-scraper']);
    assert.equal(s.status, 'running');
    assert.equal(Object.keys(s.sources!).length, 2);
    await scanner.finish('yad2', 'run-amit123~YadScraper', { raw: 10, sampleKeys: [], found: 10, matched: 4, added: 3 });
    let st = store.meta.scan!;
    assert.equal(st.status, 'running'); // Madlan still going
    await scanner.finish('madlan', 'run-swerve~madlan-scraper', { raw: 6, sampleKeys: [], found: 6, matched: 2, added: 1 });
    st = store.meta.scan!;
    assert.equal(st.status, 'succeeded');
    assert.deepEqual([st.found, st.matched, st.added], [16, 6, 4]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.APIFY_TOKEN;
  }
});
