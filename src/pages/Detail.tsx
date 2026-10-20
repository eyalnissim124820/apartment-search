import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BedDouble, Briefcase, CalendarPlus, Car, Check, ChevronLeft, ChevronRight, ClipboardCheck,
  ExternalLink, LocateFixed, TrainFront, Wallet, Heart, Layers, Mail, MapPin,
  Maximize, MessageCircle, Pencil, Phone, Plus, RotateCcw, Send, Share2, ThumbsDown, ThumbsUp, Trash2,
  TriangleAlert, Undo2, X,
} from 'lucide-react';
import { ALL_STATUSES, FEATURE_KEYS, PIPELINE, USERS, type Apartment, type Contact, type Status, type UserId } from '../../shared/types';
import { geoQuery, hasOwner, nextStatus, otherUser, overBudget, OWNER_STATUSES, statusIndex, totalMonthly } from '../../shared/workflow';
import { checklistSummary } from './Checklist';
import { useApp } from '../state';
import { api } from '../lib/api';
import { ago, dateShort, dateTime, fromLocalInput, money, phoneLinks, toLocalInput } from '../lib/format';
import { Avatar, Empty, FEATURE_ICON, Img, Placeholder, STATUS_DOT, StatusBadge, Stars } from '../components/ui';
import { ContactSheet } from '../components/ContactSheet';
import { featureKey, roleKey, sourceKey, statusKey, userKey, type StringKey } from '../i18n/strings';

export default function Detail() {
  const { id } = useParams();
  const { apartments, loaded, t } = useApp();
  const apt = apartments.find((a) => a.id === id);
  if (!apt) return loaded ? <div className="pt-16"><Empty title={t('emptyFiltered')} /></div> : null;
  return <DetailView apt={apt} />;
}

function DetailView({ apt }: { apt: Apartment }) {
  const { t, lang, user, mutate, showToast, settings } = useApp();
  const me = user!;
  const nav = useNavigate();
  const [contactSheet, setContactSheet] = useState<{ initial?: Partial<Contact>; owner?: boolean } | null>(null);
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;

  /** After any status move, ask for owner details if we just got to that stage without them. */
  const afterMove = (out: Apartment | void) => {
    if (!out) return;
    if (out.status !== apt.status) showToast(t('matchMovedTo', { status: t(statusKey(out.status)) }));
    if (OWNER_STATUSES.includes(out.status) && !hasOwner(out)) setContactSheet({ initial: { role: 'owner' }, owner: true });
  };

  const fav = apt.favorites.includes(me);
  const over = overBudget(apt, settings?.budget);
  const checks = checklistSummary(apt);
  const Fwd = lang === 'he' ? ChevronLeft : ChevronRight;
  const place = [apt.address, apt.neighborhood, apt.city].filter(Boolean).join(', ');
  const monthly = totalMonthly(apt);
  const mapsUrl = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;

  const share = async () => {
    const url = apt.listingUrl || window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: apt.title, url });
      else { await navigator.clipboard.writeText(url); showToast(t('copied')); }
    } catch { /* user cancelled */ }
  };

  const del = async () => {
    if (!confirm(t('deleteConfirm', { title: apt.title }))) return;
    await mutate(() => api.remove(apt.id), apt.id);
    nav('/', { replace: true });
  };

  return (
    <main className="pt-safe">
      <div className="flex items-center justify-between pt-2">
        <button className="icon-btn" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} aria-label="back">
          <Back size={20} />
        </button>
        <div className="flex gap-2">
          <button className="icon-btn" onClick={() => mutate(() => api.favorite(apt.id))} aria-label={t('favorites')}>
            <Heart size={20} className={fav ? 'fill-[#FF4D6D] text-[#FF4D6D]' : ''} />
          </button>
          <button className="icon-btn" onClick={share} aria-label={t('share')}><Share2 size={20} /></button>
          <Link className="icon-btn" to={`/apt/${apt.id}/edit`} aria-label={t('edit')}><Pencil size={19} /></Link>
        </div>
      </div>

      {/* Title */}
      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <StatusBadge status={apt.status} />
          <h1 className="mt-3 text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight break-words">{apt.title}</h1>
          {place && (
            <a href={mapsUrl!} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-ink/60 underline-offset-4 hover:underline">
              <MapPin size={16} /> {place}
            </a>
          )}
          <p className="mt-1 text-sm text-ink/40">
            {t('addedBy', { name: t(userKey(apt.createdBy)) })} · {dateShort(apt.createdAt, lang)}
            {apt.source && ` · ${t(sourceKey(apt.source))}`}
          </p>
        </div>
      </div>

      <Gallery images={apt.images} />

      {/* Key facts */}
      <section className="mt-4 grid grid-cols-3 gap-3">
        <Fact icon={<BedDouble size={18} />} value={apt.rooms ?? '—'} label={t('rooms')} />
        <Fact icon={<Maximize size={17} />} value={apt.sizeSqm ?? '—'} label={t('sqm')} />
        <Fact
          icon={<Layers size={17} />}
          value={apt.floor ?? '—'}
          label={apt.totalFloors ? `${t('floor')} / ${apt.totalFloors}` : t('floor')}
        />
      </section>

      <section className="card mt-3 p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-bold">{money(apt.price, lang)}</div>
            <div className="text-sm text-ink/45">{t('perMonth')}</div>
          </div>
          {apt.listingUrl && (
            <a href={apt.listingUrl} target="_blank" rel="noreferrer" className="btn-accent !h-11">
              {t('openListing')} <ExternalLink size={16} />
            </a>
          )}
        </div>
        {(apt.arnona || apt.vaadBayit) && (
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-ink/5 pt-4 text-sm">
            <Cost label={t('arnona')} value={money(apt.arnona, lang)} />
            <Cost label={t('vaadBayit')} value={money(apt.vaadBayit, lang)} />
            <Cost label={t('totalMonthly')} value={money(monthly, lang)} strong />
          </dl>
        )}
        {apt.entryDate && (
          <p className="mt-3 text-sm text-ink/60">{t('entry')}: {dateShort(apt.entryDate, lang)}</p>
        )}
      </section>

      {over > 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-3xl bg-[#FDECEC] p-4 text-sm font-medium text-[#B42318]">
          <Wallet size={18} /> {t('overBudgetLong', { amount: money(over, lang) })}
        </p>
      )}

      <CommuteCard apt={apt} />

      <Pipeline status={apt.status} rejectedFrom={apt.rejectedFrom} />
      <VotePanel apt={apt} me={me} onMoved={afterMove} />

      {OWNER_STATUSES.includes(apt.status) && !hasOwner(apt) && (
        <button
          onClick={() => setContactSheet({ initial: { role: 'owner' }, owner: true })}
          className="mt-3 flex w-full items-center gap-3 rounded-3xl bg-[#FFF3DF] p-4 text-start text-[#7A4808]"
        >
          <TriangleAlert size={20} /> <span className="flex-1 font-medium">{t('ownerMissing')}</span>
          <span className="btn !h-9 !px-4 bg-white text-sm">{t('addOwner')}</span>
        </button>
      )}

      {/* Contacts */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="section-title !mb-0">{t('contacts')}</h2>
          <button className="chip" onClick={() => setContactSheet({})}>
            <Plus size={16} /> {t('addContact')}
          </button>
        </div>
        <div className="mt-3 grid gap-3">
          {apt.contacts.length === 0 && <p className="text-ink/45 text-sm">{t('noContacts')}</p>}
          {[...apt.contacts]
            .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0))
            .map((c) => (
              <ContactRow
                key={c.id}
                c={c}
                onEdit={() => setContactSheet({ initial: c })}
                onDelete={() => mutate(() => api.removeContact(apt.id, c.id))}
              />
            ))}
        </div>
      </section>

      {/* Viewing */}
      <ViewingCard apt={apt} />
      <Link to={`/apt/${apt.id}/checklist`} className="card mt-4 flex items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <ClipboardCheck size={22} />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-semibold">{t('checklist')}</span>
          <span className="block text-sm text-ink/55">
            {t('checklistProgress', { done: checks.done, total: checks.total })}
            {checks.issues > 0 && <span className="text-[#B42318]"> · {t('checklistIssues', { n: checks.issues })}</span>}
          </span>
        </span>
        <Fwd size={20} className="text-ink/40" />
      </Link>

      {/* Ratings */}
      <section className="card mt-4 p-5">
        <h2 className="section-title">{t('rating')}</h2>
        <div className="grid gap-3">
          {[me, otherUser(me)].map((u) => (
            <div key={u} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Avatar user={u} size={32} />
                <span className="font-medium">{u === me ? t('yourRating') : t(userKey(u))}</span>
              </span>
              <Stars
                value={apt.ratings[u]}
                onChange={u === me ? (n) => mutate(() => api.rate(apt.id, n)) : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      {FEATURE_KEYS.some((k) => apt.features[k]) && (
        <section className="mt-8">
          <h2 className="section-title">{t('features')}</h2>
          <div className="flex flex-wrap gap-2">
            {FEATURE_KEYS.filter((k) => apt.features[k]).map((k) => {
              const Icon = FEATURE_ICON[k];
              return (
                <span key={k} className="chip !shadow-none">
                  <Icon size={16} /> {t(featureKey(k))}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {apt.description && (
        <section className="mt-8">
          <h2 className="section-title">{t('description')}</h2>
          <p className="whitespace-pre-line leading-relaxed text-ink/80" dir="auto">{apt.description}</p>
        </section>
      )}

      <Comments apt={apt} me={me} />
      <History apt={apt} />

      <section className="mt-8 grid gap-2">
        <label className="card flex items-center justify-between gap-3 p-4">
          <span className="font-medium">{t('changeStatus')}</span>
          <select
            className="field !w-auto !h-10"
            value={apt.status}
            onChange={(e) => mutate(() => api.setStatus(apt.id, e.target.value as Status)).then(afterMove)}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{t(statusKey(s))}</option>
            ))}
          </select>
        </label>
        <button className="btn w-full bg-[#FDECEC] text-[#B42318]" onClick={del}>
          <Trash2 size={18} /> {t('delete')}
        </button>
      </section>

      <ContactSheet
        open={!!contactSheet}
        onClose={() => setContactSheet(null)}
        initial={contactSheet?.initial}
        title={contactSheet?.owner ? t('ownerPromptTitle') : contactSheet?.initial?.id ? t('edit') : t('addContact')}
        onSave={(c) => mutate(() => api.saveContact(apt.id, c))}
      />
    </main>
  );
}

function Gallery({ images }: { images: string[] }) {
  if (!images.length) return <Placeholder className="mt-5 h-56 rounded-4xl" />;
  return (
    <div className="-mx-4 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 no-scrollbar">
      {images.map((src, i) => (
        <a key={i} href={src} target="_blank" rel="noreferrer" className="snap-center shrink-0 w-[85%] sm:w-[70%] first:w-full only:w-full">
          <Img src={src} className="h-64 sm:h-80 w-full rounded-4xl shadow-card" />
        </a>
      ))}
    </div>
  );
}

function Fact({ icon, value, label }: { icon: JSX.Element; value: string | number; label: string }) {
  return (
    <div className="card flex flex-col items-center gap-1 py-4 !rounded-3xl">
      <span className="text-ink/45">{icon}</span>
      <span className="text-xl font-bold">{value}</span>
      <span className="text-xs text-ink/50">{label}</span>
    </div>
  );
}

function Cost({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-ink/45">{label}</dt>
      <dd className={strong ? 'font-bold' : 'font-medium'}>{value}</dd>
    </div>
  );
}

function Pipeline({ status, rejectedFrom }: { status: Status; rejectedFrom?: Status }) {
  const { t } = useApp();
  const current = statusIndex(status === 'rejected' ? (rejectedFrom ?? 'pending_review') : status);
  return (
    <section className="mt-8">
      <h2 className="section-title">{t('pipeline')}</h2>
      <ol className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2 no-scrollbar">
        {PIPELINE.map((s, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li
              key={s}
              className={`flex shrink-0 items-center gap-1.5 rounded-full h-9 px-3.5 text-xs font-medium ${
                here
                  ? status === 'rejected' ? 'bg-[#FDECEC] text-[#B42318]' : 'bg-ink text-white'
                  : done ? 'bg-white text-ink shadow-card' : 'bg-white/50 text-ink/35'
              }`}
            >
              {done ? <Check size={13} /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: here ? '#fff' : STATUS_DOT[s] }} />}
              {t(statusKey(s))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function VotePanel({ apt, me, onMoved }: { apt: Apartment; me: UserId; onMoved: (a: Apartment | void) => void }) {
  const { t, mutate } = useApp();
  const next = nextStatus(apt.status);

  if (apt.status === 'rejected') {
    return (
      <div className="card mt-3 flex items-center justify-between gap-3 p-5">
        <span className="font-medium text-[#B42318]">{t('rejectedBanner')}</span>
        <button className="btn-dark !h-10" onClick={() => mutate(() => api.restore(apt.id)).then(onMoved)}>
          <RotateCcw size={16} /> {t('restore')}
        </button>
      </div>
    );
  }
  if (!next) {
    return <div className="card mt-3 p-5 text-center text-lg font-semibold">{t('finalStep')}</div>;
  }

  const mine = apt.votes[me];
  const split = USERS.every((u) => apt.votes[u]) && apt.votes[me] !== apt.votes[otherUser(me)];
  const vote = (v: 'approve' | 'reject' | null) => mutate(() => api.vote(apt.id, v)).then(onMoved);

  return (
    <section className="card mt-3 p-5">
      <h2 className="text-lg font-semibold">{t('stepVote')}</h2>
      <p className="text-sm text-ink/55">{t('stepVoteSub', { next: t(statusKey(next)) })}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {USERS.map((u) => {
          const v = apt.votes[u];
          return (
            <div key={u} className="flex items-center gap-2 rounded-2xl bg-haze p-3">
              <Avatar user={u} size={36} />
              <div className="min-w-0">
                <div className="font-medium leading-tight">{t(userKey(u))}</div>
                <div className={`text-xs ${v === 'approve' ? 'text-[#0F7A55]' : v === 'reject' ? 'text-[#B42318]' : 'text-ink/45'}`}>
                  {v === 'approve' ? `✓ ${t('approved')}` : v === 'reject' ? `✕ ${t('rejected')}` : t('waiting')}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {split && <p className="mt-3 rounded-2xl bg-[#FFF3DF] p-3 text-sm text-[#7A4808]">{t('splitVote')}</p>}
      {mine ? (
        <button className="btn-ghost mt-3 w-full" onClick={() => vote(null)}>
          <Undo2 size={18} /> {t('undoVote')}
        </button>
      ) : (
        <div className="mt-4 flex gap-2">
          <button className="btn-light flex-1 whitespace-nowrap !px-3" onClick={() => vote('reject')}>
            <ThumbsDown size={18} /> {t('reject')}
          </button>
          <button className="btn-accent flex-[1.4] whitespace-nowrap !px-3" onClick={() => vote('approve')}>
            <ThumbsUp size={18} /> {t(`advance.${apt.status}` as StringKey)}
          </button>
        </div>
      )}
    </section>
  );
}

function ContactRow({ c, onEdit, onDelete }: { c: Contact; onEdit: () => void; onDelete: () => void }) {
  const { t } = useApp();
  const links = c.phone ? phoneLinks(c.phone) : null;
  return (
    <div className={`card flex items-center gap-3 p-4 ${c.role === 'owner' ? 'ring-2 ring-[#F09A19]/40' : ''}`}>
      <button className="min-w-0 flex-1 text-start" onClick={onEdit}>
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">{c.name || c.phone}</span>
          <span className="rounded-full bg-haze px-2 py-0.5 text-[11px] text-ink/60">{t(roleKey(c.role))}</span>
        </div>
        {c.phone && <div className="text-sm text-ink/55" dir="ltr" style={{ textAlign: 'start' }}>{c.phone}</div>}
        {c.notes && <div className="text-xs text-ink/45 truncate">{c.notes}</div>}
      </button>
      {links && (
        <>
          <a className="icon-btn !h-11 !w-11 !shadow-none bg-haze" href={links.wa} target="_blank" rel="noreferrer" aria-label={t('whatsapp')}>
            <MessageCircle size={18} />
          </a>
          <a className="icon-btn !h-11 !w-11 bg-ink text-white" href={links.tel} aria-label={t('call')}>
            <Phone size={18} />
          </a>
        </>
      )}
      {c.email && !links && (
        <a className="icon-btn !h-11 !w-11 !shadow-none bg-haze" href={`mailto:${c.email}`} aria-label={t('email')}>
          <Mail size={18} />
        </a>
      )}
      <button className="text-ink/30 hover:text-[#B42318] p-1" onClick={() => confirm(`${t('delete')}?`) && onDelete()} aria-label={t('delete')}>
        <X size={18} />
      </button>
    </div>
  );
}

function ViewingCard({ apt }: { apt: Apartment }) {
  const { t, lang, mutate } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toLocalInput(apt.viewingAt));
  const gcal = apt.viewingAt
    ? (() => {
        const start = new Date(apt.viewingAt);
        const end = new Date(start.getTime() + 45 * 60000);
        const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
        const where = [apt.address, apt.city].filter(Boolean).join(', ');
        return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
          `${t('viewing')}: ${apt.title}`,
        )}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(where)}`;
      })()
    : null;

  return (
    <section className="card mt-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('viewing')}</h2>
          <p className="text-ink/60">{apt.viewingAt ? dateTime(apt.viewingAt, lang) : '—'}</p>
        </div>
        <div className="flex gap-2">
          {gcal && (
            <a className="icon-btn !h-11 !w-11 !shadow-none bg-haze" href={gcal} target="_blank" rel="noreferrer" aria-label="Google Calendar">
              <CalendarPlus size={18} />
            </a>
          )}
          <button className="chip !shadow-none !bg-haze" onClick={() => { setDraft(toLocalInput(apt.viewingAt)); setEditing((e) => !e); }}>
            {t('scheduleViewing')}
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await mutate(() => api.update(apt.id, { viewingAt: fromLocalInput(draft) ?? '' }));
            setEditing(false);
          }}
        >
          <input type="datetime-local" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn-dark !h-12" aria-label={t('save')}><Check size={18} /></button>
        </form>
      )}
    </section>
  );
}

function Comments({ apt, me }: { apt: Apartment; me: UserId }) {
  const { t, mutate } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await mutate(() => api.comment(apt.id, text)); setText(''); } finally { setBusy(false); }
  };
  return (
    <section className="mt-8">
      <h2 className="section-title">{t('notes')}</h2>
      <div className="grid gap-2">
        {apt.comments.map((c) => {
          const mine = c.user === me;
          return (
            <div key={c.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
              <Avatar user={c.user} size={28} />
              <div
                className={`group max-w-[80%] rounded-3xl px-4 py-2.5 ${mine ? 'bg-ink text-white rounded-ee-md' : 'bg-white shadow-card rounded-es-md'}`}
              >
                <p className="whitespace-pre-line" dir="auto">{c.text}</p>
                <div className={`mt-0.5 flex items-center gap-2 text-[11px] ${mine ? 'text-white/50' : 'text-ink/40'}`}>
                  {ago(c.createdAt, t)}
                  {mine && (
                    <button onClick={() => mutate(() => api.removeComment(apt.id, c.id))} aria-label={t('delete')}>
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form
        className="mt-3 flex items-center gap-2 rounded-full bg-white p-1.5 shadow-card"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <input
          className="h-11 flex-1 bg-transparent px-4 focus:outline-none"
          placeholder={t('notesPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="auto"
        />
        <button className="icon-btn !h-11 !w-11 bg-accent text-white" disabled={busy || !text.trim()} aria-label={t('send')}>
          <Send size={18} className="rtl:-scale-x-100" />
        </button>
      </form>
    </section>
  );
}

function History({ apt }: { apt: Apartment }) {
  const { t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const items = [...apt.history].reverse();
  const shown = open ? items : items.slice(0, 3);
  const name = (u: UserId | 'system') => (u === 'system' ? t('system') : t(userKey(u)));
  return (
    <section className="mt-8">
      <h2 className="section-title">{t('history')}</h2>
      <ol className="relative border-s-2 border-ink/10 ms-2 grid gap-4">
        {shown.map((h) => (
          <li key={h.id} className="ps-4 relative">
            <span className="absolute -start-[7px] top-1.5 h-3 w-3 rounded-full bg-white ring-2 ring-ink/20" />
            <p className="text-sm">
              {t(`history.${h.action}` as StringKey, {
                user: name(h.user),
                from: h.from ? t(statusKey(h.from)) : '',
                to: h.to ? t(statusKey(h.to)) : '',
              })}
            </p>
            <p className="text-xs text-ink/40">{dateTime(h.at, lang)}</p>
          </li>
        ))}
      </ol>
      {items.length > 3 && (
        <button className="mt-3 text-sm font-medium text-accent" onClick={() => setOpen((o) => !o)}>
          {open ? '−' : `+${items.length - 3}`}
        </button>
      )}
    </section>
  );
}

function CommuteCard({ apt }: { apt: Apartment }) {
  const { t, settings, mutate } = useApp();
  const [busy, setBusy] = useState(false);
  const workers = USERS.filter((u) => settings?.work[u]?.address);
  const query = geoQuery(apt);

  const relocate = async () => {
    setBusy(true);
    try { await mutate(() => api.locate(apt.id)); } finally { setBusy(false); }
  };

  if (!workers.length) {
    return (
      <Link to="/settings" className="mt-3 flex items-center gap-3 rounded-3xl bg-white/60 p-4 text-sm text-ink/60">
        <Briefcase size={18} /> {t('commuteSetup')}
      </Link>
    );
  }
  return (
    <section className="card mt-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('commute')}</h2>
        {query && (
          <button className="text-ink/40 p-1" onClick={relocate} disabled={busy} aria-label={t('relocate')} title={t('relocate')}>
            <LocateFixed size={18} className={busy ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
      {!apt.geo ? (
        <p className="mt-2 text-sm text-ink/50">{query ? (busy ? t('locating') : t('noLocation')) : t('noLocation')}</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {!apt.address && (
            <Link
              to={`/apt/${apt.id}/edit`}
              className="flex items-center gap-2 rounded-2xl bg-[#FFF3DF] p-3 text-sm text-[#7A4808]"
            >
              <TriangleAlert size={16} className="shrink-0" /> {t('commuteApprox')}
            </Link>
          )}
          {workers.map((u) => {
            const c = apt.commute?.[u];
            const work = settings!.work[u]!.address;
            const transit = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(query)}&destination=${encodeURIComponent(work)}&travelmode=transit`;
            return (
              <div key={u} className="flex items-center gap-3 rounded-2xl bg-haze p-3">
                <Avatar user={u} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 font-semibold">
                    <Car size={16} />
                    <span className="whitespace-nowrap">{c ? `${c.minutes} ${t('min')}` : '—'}</span>
                    {c && (
                      <span className="whitespace-nowrap text-xs font-normal text-ink/45">
                        · {c.km} {t('km')} {c.estimated ? `(${t('estimated')})` : ''}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-ink/45">{work}</div>
                </div>
                <a href={transit} target="_blank" rel="noreferrer" className="icon-btn !h-10 !w-10 !shadow-none" title={t('transit')} aria-label={t('transit')}>
                  <TrainFront size={18} />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
