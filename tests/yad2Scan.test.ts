import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapYad2Item } from '../server/yad2Scan.js';
import { ApartmentService } from '../server/service.js';
import { emptyMeta, type Meta, type Store } from '../server/store/Store.js';
import type { Apartment } from '../shared/types.js';

// Shape taken from the amit123/YadScraper README output table.
const item = {
  item_id: 'abc123',
  item_url: 'https://www.yad2.co.il/realestate/item/abc123',
  location: 'בזל 12, הצפון הישן, תל אביב יפו',
  price: 7800,
  rooms: 3,
  square_meter: 72,
  floor: 2,
  building_top_floor: 4,
  entrance_date: '2026-12-01T00:00:00',
  property_condition: 'משופץ',
  description: 'דירה מוארת',
  images: ['https://img.yad2.co.il/Pic/a.jpeg', 'https://img.yad2.co.il/Pic/b.jpeg'],
  geographic_polygon: { type: 'Point', coordinates: [34.7769, 32.0901] as [number, number] },
  mediation: true,
  include_air_condition: true,
  elevator: true,
  parking: false,
  safe_room: true,
  source: 'yad2',
};

test('maps a YadScraper result to an apartment', () => {
  const a = mapYad2Item(item)!;
  assert.equal(a.externalId, 'yad2:abc123');
  assert.equal(a.title, '3 חד׳ בבזל 12, תל אביב יפו');
  assert.equal(a.address, 'בזל 12');
  assert.equal(a.neighborhood, 'הצפון הישן');
  assert.equal(a.city, 'תל אביב יפו');
  assert.equal(a.price, 7800);
  assert.equal(a.sizeSqm, 72);
  assert.equal(a.floor, 2);
  assert.equal(a.totalFloors, 4);
  assert.equal(a.entryDate, '2026-12-01');
  assert.deepEqual(a.features, { airConditioning: true, elevator: true, safeRoom: true });
  assert.equal(a.images?.length, 2);
  assert.deepEqual(a.geo, { lat: 32.0901, lng: 34.7769, query: 'בזל 12, הצפון הישן, תל אביב יפו' });
  assert.match(a.description!, /משופץ · תיווך/);
  assert.equal(mapYad2Item({ price: 5 }), null);
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

test('importExternal skips listings already saved (by id or by link)', async () => {
  const store = new MemoryStore();
  const svc = new ApartmentService(store);
  // Saved manually earlier from the same Yad2 link, with a tracking query string.
  await svc.create({ title: 'ידני', listingUrl: 'https://yad2.co.il/realestate/item/abc123?opened-from=feed' }, 'eyal');
  const other = mapYad2Item({ ...item, item_id: 'zzz', item_url: 'https://www.yad2.co.il/realestate/item/zzz' })!;
  const first = await svc.importExternal([mapYad2Item(item)!, other]);
  assert.deepEqual(first.map((a) => a.externalId), ['yad2:zzz']);
  assert.equal(first[0].createdBy, 'system');
  assert.equal(first[0].status, 'pending_review');
  assert.ok(first[0].geo);
  const again = await svc.importExternal([other]);
  assert.equal(again.length, 0);
});

import { buildYad2SearchUrl, matchesScanFilters } from '../shared/yad2.js';

test('builds a Yad2 search URL from the filters', () => {
  const url = buildYad2SearchUrl('5000', {
    cities: ['5000'], minPrice: 6000, maxPrice: 9000, minRooms: 3, maxRooms: 4, mustHave: ['parking', 'safeRoom'],
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://www.yad2.co.il/realestate/rent');
  assert.deepEqual(Object.fromEntries(u.searchParams), {
    city: '5000', minPrice: '6000', maxPrice: '9000', minRooms: '3', maxRooms: '4', parking: '1',
  });
});

test('filters scanned listings', () => {
  const f = { cities: ['5000'], maxPrice: 9000, minRooms: 3, neighborhoods: ['הצפון הישן'], mustHave: ['safeRoom' as const] };
  const base = mapYad2Item(item)!; // 7800, 3 rooms, Tel Aviv, הצפון הישן, safe room
  assert.equal(matchesScanFilters(base, f), true);
  assert.equal(matchesScanFilters({ ...base, price: 9500 }, f), false);
  assert.equal(matchesScanFilters({ ...base, rooms: 2 }, f), false);
  assert.equal(matchesScanFilters({ ...base, city: 'חולון' }, f), false);
  assert.equal(matchesScanFilters({ ...base, city: 'חולון' }, f, false), true); // city not enforced
  assert.equal(matchesScanFilters({ ...base, neighborhood: 'פלורנטין', description: '' }, f), false);
  assert.equal(matchesScanFilters({ ...base, features: {} }, f), false);
  assert.equal(matchesScanFilters({ ...base, price: undefined }, f), true); // unknown values pass
});
