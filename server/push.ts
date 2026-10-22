import webpush from 'web-push';
import type { Apartment, Status, UserId, Vote } from '../shared/types.js';
import { USERS } from '../shared/types.js';
import type { Meta, PushSubscriptionRecord, Store } from './store/Store.js';
import { background } from './background.js';

/**
 * Standard Web Push (VAPID) – free, no third-party account. Works in Chrome/
 * Edge/Firefox on Android & desktop, and on iOS 16.4+ once the app is added
 * to the home screen. Keys come from env or are generated once and persisted.
 */

type Lang = 'he' | 'en';

const NAMES: Record<Lang, Record<UserId, string>> = { he: { eyal: 'אייל', ofir: 'אופיר' }, en: { eyal: 'Eyal', ofir: 'Ofir' } };
const STATUS: Record<Lang, Record<Status, string>> = {
  he: {
    pending_review: 'ממתין לבדיקה', relevant: 'רלוונטי', contacted: 'יצרנו קשר', responded: 'התקבלה תגובה',
    approved: 'מאושר', proceed_with_owner: 'מתקדמים מול בעלים', contract: 'חוזה', rejected: 'נדחה',
  },
  en: {
    pending_review: 'Pending review', relevant: 'Relevant', contacted: 'Contacted', responded: 'Responded',
    approved: 'Approved', proceed_with_owner: 'With owner', contract: 'Contract', rejected: 'Rejected',
  },
};

export type AppEvent =
  | { type: 'created'; apt: Apartment; user: UserId }
  | { type: 'vote'; apt: Apartment; user: UserId; vote: Vote; moved: boolean }
  | { type: 'status'; apt: Apartment; user: UserId }
  | { type: 'comment'; apt: Apartment; user: UserId; text: string }
  | { type: 'viewing'; apt: Apartment; lead: '24h' | '1h' };

interface Message { title: string; body: string; url: string; tag: string }

function render(e: AppEvent, lang: Lang): Message {
  const he = lang === 'he';
  const url = `/apt/${e.apt.id}`;
  const title = e.apt.title;
  const tag = `${e.type}-${e.apt.id}`;
  switch (e.type) {
    case 'created':
      return { title: he ? `${NAMES.he[e.user]} הוסיף/ה דירה` : `${NAMES.en[e.user]} added an apartment`, body: title, url, tag };
    case 'vote':
      if (e.moved && e.apt.status !== 'rejected') {
        return { title: he ? 'יש התאמה! 🎉' : 'It’s a match! 🎉', body: `${title} → ${STATUS[lang][e.apt.status]}`, url, tag };
      }
      if (e.moved) return { title: he ? 'שניכם דחיתם' : 'You both passed', body: title, url, tag };
      return {
        title: he
          ? `${NAMES.he[e.user]} ${e.vote === 'approve' ? 'אישר/ה' : 'דחה/תה'} – תורך להצביע`
          : `${NAMES.en[e.user]} ${e.vote === 'approve' ? 'approved' : 'passed'} – your turn`,
        body: title, url, tag,
      };
    case 'status':
      return { title: he ? `${NAMES.he[e.user]} עדכן/ה סטטוס` : `${NAMES.en[e.user]} changed status`, body: `${title} → ${STATUS[lang][e.apt.status]}`, url, tag };
    case 'comment':
      return { title: `${NAMES[lang][e.user]} · ${title}`, body: e.text.slice(0, 140), url, tag: `comment-${e.apt.id}` };
    case 'viewing': {
      const at = new Date(e.apt.viewingAt!).toLocaleTimeString(he ? 'he-IL' : 'en-IL', {
        hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ_DISPLAY ?? 'Asia/Jerusalem',
      });
      const where = [e.apt.address, e.apt.city].filter(Boolean).join(', ');
      const when = e.lead === '1h' ? (he ? 'בעוד שעה' : 'in 1 hour') : (he ? 'מחר' : 'tomorrow');
      return { title: he ? `צפייה ${when} · ${at}` : `Viewing ${when} · ${at}`, body: [title, where].filter(Boolean).join(' – '), url, tag: `viewing-${e.apt.id}` };
    }
  }
}

/** Who should hear about an event: the other partner, or both for matches and reminders. */
function recipients(e: AppEvent): UserId[] {
  if (e.type === 'viewing' || (e.type === 'vote' && e.moved)) return [...USERS];
  return USERS.filter((u) => u !== e.user);
}

export class PushService {
  private ready: Promise<Meta>;

  constructor(private readonly store: Store) {
    this.ready = this.init();
  }

  private async init() {
    const meta = await this.store.getMeta();
    let { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env;
    if (!pub || !priv) {
      if (!meta.vapid) {
        meta.vapid = webpush.generateVAPIDKeys();
        await this.store.saveMeta(meta);
        console.log('[push] generated VAPID keys');
      }
      ({ publicKey: pub, privateKey: priv } = meta.vapid);
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:noreply@home-hunt.app', pub, priv);
    meta.vapid = { publicKey: pub, privateKey: priv };
    return meta;
  }

  async publicKey() {
    return (await this.ready).vapid!.publicKey;
  }

  async subscribe(user: UserId, sub: { endpoint: string; keys: PushSubscriptionRecord['keys'] }, lang: Lang) {
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Invalid subscription');
    await this.ready;
    const meta = await this.store.getMeta();
    meta.subscriptions = meta.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
    meta.subscriptions.push({ user, endpoint: sub.endpoint, keys: sub.keys, lang, createdAt: new Date().toISOString() });
    await this.store.saveMeta(meta);
  }

  async unsubscribe(endpoint: string) {
    const meta = await this.store.getMeta();
    meta.subscriptions = meta.subscriptions.filter((s) => s.endpoint !== endpoint);
    await this.store.saveMeta(meta);
  }

  async sendTo(users: UserId[], make: (lang: Lang) => Message) {
    await this.ready;
    const meta = await this.store.getMeta();
    const dead: string[] = [];
    await Promise.all(
      meta.subscriptions
        .filter((s) => users.includes(s.user))
        .map(async (s) => {
          try {
            await webpush.sendNotification(s, JSON.stringify(make(s.lang ?? 'he')), { TTL: 60 * 60 * 6 });
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) dead.push(s.endpoint); // subscription expired
            else console.warn('[push] send failed', code ?? err);
          }
        }),
    );
    if (dead.length) {
      const fresh = await this.store.getMeta();
      fresh.subscriptions = fresh.subscriptions.filter((s) => !dead.includes(s.endpoint));
      await this.store.saveMeta(fresh);
    }
  }

  /** Send in the background; the returned promise can be awaited when the caller needs it done. */
  notify(e: AppEvent) {
    return background(this.sendTo(recipients(e), (lang) => render(e, lang)), 'push');
  }

  /** Tell both partners that the automatic scan found new listings. */
  notifyScan(added: Apartment[]) {
    if (!added.length) return Promise.resolve(undefined);
    const n = added.length;
    return background(
      this.sendTo([...USERS], (lang) => ({
        title: lang === 'he' ? `נמצאו ${n} דירות חדשות` : `${n} new listing${n > 1 ? 's' : ''} found`,
        body: added.slice(0, 3).map((a) => a.title).join(' · '),
        url: '/match',
        tag: 'scan',
      })),
      'push',
    );
  }

  test(user: UserId) {
    return this.sendTo([user], (lang) => ({
      title: lang === 'he' ? 'התראות פועלות ✓' : 'Notifications work ✓',
      body: lang === 'he' ? 'נעדכן אותך על הצבעות וצפיות' : 'We’ll ping you about votes and viewings',
      url: '/',
      tag: 'test',
    }));
  }
}

const LEADS = [
  { lead: '24h' as const, ms: 24 * 3600_000, minMs: 2 * 3600_000 }, // skip "tomorrow" if it's already <2h away
  { lead: '1h' as const, ms: 3600_000, minMs: 0 },
];

/** Push reminders for viewings coming up in 24h and 1h. Safe to call repeatedly. Returns how many were sent. */
export async function sendDueReminders(store: Store, push: Pick<PushService, 'notify'>): Promise<number> {
  const now = Date.now();
  let sent = 0;
  for (const apt of await store.list()) {
    if (!apt.viewingAt || apt.status === 'rejected') continue;
    const until = new Date(apt.viewingAt).getTime() - now;
    if (until <= 0) continue;
    for (const { lead, ms, minMs } of LEADS) {
      const key = `${apt.viewingAt}|${lead}`;
      if (until > ms || until < minMs || apt.remindersSent?.includes(key)) continue;
      const fresh = await store.get(apt.id);
      if (!fresh) break;
      fresh.remindersSent = [...(fresh.remindersSent ?? []).filter((k) => k.startsWith(apt.viewingAt!)), key];
      await store.save(fresh);
      await push.notify({ type: 'viewing', apt: fresh, lead });
      sent++;
      break;
    }
  }
  return sent;
}

/** Local/long-running servers: check for due reminders every few minutes. */
export function startViewingReminders(store: Store, push: Pick<PushService, 'notify'>, everyMs = 5 * 60_000) {
  const run = () => sendDueReminders(store, push).catch((err) => console.warn('[reminders]', err));
  run();
  return setInterval(run, everyMs);
}
