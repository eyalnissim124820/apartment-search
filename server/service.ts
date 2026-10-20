import { randomUUID } from 'node:crypto';
import {
  ALL_STATUSES,
  CHECKLIST_KEYS,
  PIPELINE,
  USERS,
  type Apartment,
  type ApartmentInput,
  type BudgetBasis,
  type ChecklistKey,
  type Contact,
  type HistoryEntry,
  type PublicSettings,
  type Status,
  type UserId,
  type Vote,
} from '../shared/types.js';
import { geoQuery, nextStatus } from '../shared/workflow.js';
import type { Store } from './store/index.js';
import type { AppEvent } from './push.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const EDITABLE_FIELDS: (keyof ApartmentInput)[] = [
  'title', 'city', 'neighborhood', 'address', 'price', 'arnona', 'vaadBayit', 'rooms',
  'sizeSqm', 'floor', 'totalFloors', 'entryDate', 'viewingAt', 'listingUrl', 'source',
  'description', 'images', 'features', 'contacts',
];

export function assertUser(u: unknown): UserId {
  if (!USERS.includes(u as UserId)) throw new HttpError(400, 'Unknown user');
  return u as UserId;
}

function assertStatus(s: unknown): Status {
  if (!ALL_STATUSES.includes(s as Status)) throw new HttpError(400, 'Unknown status');
  return s as Status;
}

function pickInput(body: Record<string, unknown>): Partial<ApartmentInput> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_FIELDS) if (k in body) out[k] = body[k] === '' ? undefined : body[k];
  if (out.contacts) {
    out.contacts = (out.contacts as Contact[])
      .filter((c) => c && (c.name || c.phone))
      .map((c) => ({ ...c, id: c.id || randomUUID(), role: c.role || 'contact' }));
  }
  return out as Partial<ApartmentInput>;
}

const now = () => new Date().toISOString();

export interface ServiceHooks {
  /** Something a partner should hear about happened. */
  onEvent?: (e: AppEvent) => void;
  /** Apartment created or its address changed – geocode / compute commute. */
  onLocationChange?: (apt: Apartment) => void;
}

export class ApartmentService {
  constructor(private readonly store: Store, private readonly hooks: ServiceHooks = {}) {}

  list() {
    return this.store.list();
  }

  async get(id: string) {
    const apt = await this.store.get(id);
    if (!apt) throw new HttpError(404, 'Apartment not found');
    return apt;
  }

  private log(apt: Apartment, entry: Omit<HistoryEntry, 'id' | 'at'>) {
    apt.history.push({ id: randomUUID(), at: now(), ...entry });
  }

  private async commit(apt: Apartment) {
    apt.updatedAt = now();
    await this.store.save(apt);
    return apt;
  }

  private moveTo(apt: Apartment, to: Status, user: UserId | 'system', action: HistoryEntry['action']) {
    const from = apt.status;
    if (to === 'rejected' && from !== 'rejected') apt.rejectedFrom = from;
    if (to !== 'rejected') delete apt.rejectedFrom;
    apt.status = to;
    apt.votes = {};
    this.log(apt, { user, action, from, to });
  }

  async create(body: Record<string, unknown>, user: UserId) {
    const input = pickInput(body);
    if (!input.title?.trim()) throw new HttpError(400, 'Title is required');
    const status = body.status ? assertStatus(body.status) : 'pending_review';
    const ts = now();
    const apt: Apartment = {
      ...input,
      title: input.title.trim(),
      id: randomUUID(),
      createdAt: ts,
      updatedAt: ts,
      createdBy: user,
      status,
      votes: {},
      ratings: {},
      favorites: [],
      images: input.images ?? [],
      features: input.features ?? {},
      contacts: input.contacts ?? [],
      comments: [],
      history: [],
    };
    this.log(apt, { user, action: 'created', to: status });
    await this.commit(apt);
    this.hooks.onEvent?.({ type: 'created', apt, user });
    if (geoQuery(apt)) this.hooks.onLocationChange?.(apt);
    return apt;
  }

  async update(id: string, body: Record<string, unknown>, user: UserId) {
    const apt = await this.get(id);
    const before = geoQuery(apt);
    Object.assign(apt, pickInput(body));
    if (!apt.title?.trim()) throw new HttpError(400, 'Title is required');
    this.log(apt, { user, action: 'edited' });
    await this.commit(apt);
    if (geoQuery(apt) !== before) this.hooks.onLocationChange?.(apt);
    return apt;
  }

  /**
   * Tinder-style step approval: both approve → advance one step,
   * both reject → rejected. A split vote stays open for discussion.
   */
  async vote(id: string, user: UserId, vote: Vote | null) {
    const apt = await this.get(id);
    const next = nextStatus(apt.status);
    if (!next) throw new HttpError(409, 'Nothing to vote on at this status');

    if (vote === null) {
      delete apt.votes[user];
      this.log(apt, { user, action: 'vote_cleared', from: apt.status });
      return this.commit(apt);
    }

    apt.votes[user] = vote;
    this.log(apt, { user, action: vote === 'approve' ? 'vote_approve' : 'vote_reject', from: apt.status });

    const votes = USERS.map((u) => apt.votes[u]);
    const from = apt.status;
    if (votes.every((v) => v === 'approve')) this.moveTo(apt, next, 'system', 'advanced');
    else if (votes.every((v) => v === 'reject')) this.moveTo(apt, 'rejected', 'system', 'advanced');
    await this.commit(apt);
    this.hooks.onEvent?.({ type: 'vote', apt, user, vote, moved: apt.status !== from });
    return apt;
  }

  /** Manual override – either partner can move an apartment to any status. */
  async setStatus(id: string, status: unknown, user: UserId) {
    const apt = await this.get(id);
    const to = assertStatus(status);
    if (to === apt.status) return apt;
    this.moveTo(apt, to, user, 'status_set');
    await this.commit(apt);
    this.hooks.onEvent?.({ type: 'status', apt, user });
    return apt;
  }

  async restore(id: string, user: UserId) {
    const apt = await this.get(id);
    if (apt.status !== 'rejected') throw new HttpError(409, 'Apartment is not rejected');
    this.moveTo(apt, apt.rejectedFrom ?? PIPELINE[0], user, 'restored');
    return this.commit(apt);
  }

  async rate(id: string, user: UserId, rating: unknown) {
    const apt = await this.get(id);
    const n = Number(rating);
    if (!n) delete apt.ratings[user];
    else if (n >= 1 && n <= 5) apt.ratings[user] = Math.round(n);
    else throw new HttpError(400, 'Rating must be 1–5');
    return this.commit(apt);
  }

  async toggleFavorite(id: string, user: UserId) {
    const apt = await this.get(id);
    apt.favorites = apt.favorites.includes(user)
      ? apt.favorites.filter((u) => u !== user)
      : [...apt.favorites, user];
    return this.commit(apt);
  }

  async upsertContact(id: string, contact: Partial<Contact>) {
    const apt = await this.get(id);
    if (!contact.name?.trim() && !contact.phone?.trim()) throw new HttpError(400, 'Name or phone is required');
    const c: Contact = {
      id: contact.id || randomUUID(),
      role: contact.role ?? 'contact',
      name: contact.name?.trim() ?? '',
      phone: contact.phone?.trim() || undefined,
      email: contact.email?.trim() || undefined,
      notes: contact.notes?.trim() || undefined,
    };
    const i = apt.contacts.findIndex((x) => x.id === c.id);
    if (i >= 0) apt.contacts[i] = c;
    else apt.contacts.push(c);
    return this.commit(apt);
  }

  async removeContact(id: string, contactId: string) {
    const apt = await this.get(id);
    apt.contacts = apt.contacts.filter((c) => c.id !== contactId);
    return this.commit(apt);
  }

  async addComment(id: string, user: UserId, text: unknown) {
    const apt = await this.get(id);
    const t = String(text ?? '').trim();
    if (!t) throw new HttpError(400, 'Comment is empty');
    apt.comments.push({ id: randomUUID(), user, text: t, createdAt: now() });
    await this.commit(apt);
    this.hooks.onEvent?.({ type: 'comment', apt, user, text: t });
    return apt;
  }

  async removeComment(id: string, commentId: string, user: UserId) {
    const apt = await this.get(id);
    const c = apt.comments.find((x) => x.id === commentId);
    if (c && c.user !== user) throw new HttpError(403, 'You can only delete your own comments');
    apt.comments = apt.comments.filter((x) => x.id !== commentId);
    return this.commit(apt);
  }

  /** Update one viewing-checklist item. `state: null` clears it. */
  async setChecklist(id: string, user: UserId, body: { key?: unknown; state?: unknown; note?: unknown }) {
    const apt = await this.get(id);
    const key = body.key as ChecklistKey;
    if (!CHECKLIST_KEYS.includes(key)) throw new HttpError(400, 'Unknown checklist item');
    const prev = apt.checklist?.[key] ?? {};
    const state = 'state' in body ? body.state : prev.state;
    if (state != null && state !== 'ok' && state !== 'issue') throw new HttpError(400, 'Invalid state');
    const note = 'note' in body ? String(body.note ?? '').trim() || undefined : prev.note;
    apt.checklist = { ...apt.checklist };
    if (!state && !note) delete apt.checklist[key];
    else apt.checklist[key] = { state: (state as 'ok' | 'issue' | null) ?? undefined, note, by: user, at: now() };
    return this.commit(apt);
  }

  async remove(id: string) {
    if (!(await this.store.remove(id))) throw new HttpError(404, 'Apartment not found');
  }
}

export class SettingsService {
  constructor(
    private readonly store: Store,
    private readonly vapidKey: () => Promise<string>,
    private readonly locate: (address: string) => Promise<{ lat: number; lng: number } | null>,
    private readonly onWorkChange: () => void,
  ) {}

  async get(): Promise<PublicSettings> {
    const { settings } = await this.store.getMeta();
    return { ...settings, vapidPublicKey: await this.vapidKey() };
  }

  async update(body: Record<string, unknown>) {
    const meta = await this.store.getMeta();
    const s = meta.settings;
    if ('budget' in body) {
      const b = (body.budget ?? {}) as { max?: unknown; basis?: unknown };
      const max = Number(b.max);
      s.budget = {
        max: max > 0 ? Math.round(max) : undefined,
        basis: (b.basis === 'total' ? 'total' : 'rent') as BudgetBasis,
      };
    }
    let workChanged = false;
    if ('work' in body && body.work && typeof body.work === 'object') {
      for (const u of USERS) {
        if (!(u in (body.work as object))) continue;
        const address = String((body.work as Record<string, { address?: unknown } | null>)[u]?.address ?? '').trim();
        if (address === (s.work[u]?.address ?? '')) continue;
        workChanged = true;
        if (!address) { delete s.work[u]; continue; }
        let point: { lat: number; lng: number } | null = null;
        try { point = await this.locate(address); } catch { /* geocoder down – keep address, no coords */ }
        s.work[u] = { address, ...(point ?? {}) };
      }
    }
    // Re-read meta so we don't clobber push subscriptions written meanwhile.
    const fresh = await this.store.getMeta();
    fresh.settings = s;
    await this.store.saveMeta(fresh);
    if (workChanged) this.onWorkChange();
    return this.get();
  }
}
