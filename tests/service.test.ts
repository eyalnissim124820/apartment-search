import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApartmentService } from '../server/service.js';
import { emptyMeta, type Meta, type Store } from '../server/store/Store.js';
import type { AppEvent } from '../server/push.js';
import { startViewingReminders, type PushService } from '../server/push.js';
import type { Apartment } from '../shared/types.js';
import { overBudget } from '../shared/workflow.js';
import { driveTime } from '../server/geo.js';

class MemoryStore implements Store {
  apts = new Map<string, Apartment>();
  meta: Meta = emptyMeta();
  async list() { return [...this.apts.values()].map((a) => structuredClone(a)); }
  async get(id: string) { const a = this.apts.get(id); return a && structuredClone(a); }
  async save(a: Apartment) { this.apts.set(a.id, structuredClone(a)); }
  async remove(id: string) { return this.apts.delete(id); }
  async getMeta() { return structuredClone(this.meta); }
  async saveMeta(m: Meta) { this.meta = structuredClone(m); }
}

function setup() {
  const store = new MemoryStore();
  const events: AppEvent[] = [];
  const located: string[] = [];
  const svc = new ApartmentService(store, { onEvent: (e) => events.push(e), onLocationChange: (a) => located.push(a.id) });
  return { store, svc, events, located };
}

test('overBudget respects basis', () => {
  const apt = { price: 7000, arnona: 500, vaadBayit: 200 };
  assert.equal(overBudget(apt, { max: 7200, basis: 'rent' }), 0);
  assert.equal(overBudget(apt, { max: 7200, basis: 'total' }), 500);
  assert.equal(overBudget(apt, undefined), 0);
});

test('votes notify the partner, a match notifies both', async () => {
  const { svc, events } = setup();
  const apt = await svc.create({ title: 'A' }, 'eyal');
  assert.equal(events.at(-1)!.type, 'created');
  await svc.vote(apt.id, 'eyal', 'approve');
  assert.deepEqual(events.at(-1), { type: 'vote', apt: events.at(-1)!.apt, user: 'eyal', vote: 'approve', moved: false });
  const out = await svc.vote(apt.id, 'ofir', 'approve');
  assert.equal(out.status, 'relevant');
  assert.equal((events.at(-1) as Extract<AppEvent, { type: 'vote' }>).moved, true);
});

test('location changes trigger geocoding only when the address changes', async () => {
  const { svc, located } = setup();
  const apt = await svc.create({ title: 'A', city: 'חיפה' }, 'eyal');
  assert.equal(located.length, 1);
  await svc.update(apt.id, { price: 5000 }, 'eyal');
  assert.equal(located.length, 1);
  await svc.update(apt.id, { address: 'הרצל 5' }, 'ofir');
  assert.equal(located.length, 2);
});

test('checklist set, note, clear', async () => {
  const { svc } = setup();
  const apt = await svc.create({ title: 'A' }, 'eyal');
  let out = await svc.setChecklist(apt.id, 'ofir', { key: 'mould', state: 'issue' });
  assert.equal(out.checklist?.mould?.state, 'issue');
  assert.equal(out.checklist?.mould?.by, 'ofir');
  out = await svc.setChecklist(apt.id, 'ofir', { key: 'mould', note: 'בחדר רחצה' });
  assert.equal(out.checklist?.mould?.state, 'issue');
  assert.equal(out.checklist?.mould?.note, 'בחדר רחצה');
  out = await svc.setChecklist(apt.id, 'ofir', { key: 'mould', state: null, note: '' });
  assert.equal(out.checklist?.mould, undefined);
  await assert.rejects(svc.setChecklist(apt.id, 'ofir', { key: 'nope', state: 'ok' }));
});

test('viewing reminders fire once per lead time', async () => {
  const { store, svc } = setup();
  const soon = new Date(Date.now() + 40 * 60_000).toISOString();
  const tomorrow = new Date(Date.now() + 20 * 3600_000).toISOString();
  await svc.create({ title: 'Soon', viewingAt: soon }, 'eyal');
  await svc.create({ title: 'Tomorrow', viewingAt: tomorrow }, 'eyal');
  const sent: string[] = [];
  const push = { notify: (e: AppEvent) => e.type === 'viewing' && sent.push(`${e.apt.title}|${e.lead}`) } as unknown as PushService;
  const timer = startViewingReminders(store, push, 60_000);
  await new Promise((r) => setTimeout(r, 50));
  clearInterval(timer);
  assert.deepEqual(sent.sort(), ['Soon|1h', 'Tomorrow|24h']);
  // second pass sends nothing new
  const t2 = startViewingReminders(store, push, 60_000);
  await new Promise((r) => setTimeout(r, 50));
  clearInterval(t2);
  assert.equal(sent.length, 2);
});

test('driveTime returns a route, or a straight-line estimate when offline', async () => {
  const c = await driveTime({ lat: 32.08, lng: 34.78 }, { lat: 32.11, lng: 34.8 });
  assert.ok(c.minutes > 0 && c.km > 0);
});
