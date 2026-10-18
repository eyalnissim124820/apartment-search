import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Columns3 } from 'lucide-react';
import { ALL_STATUSES, FEATURE_KEYS, PIPELINE, USERS, type Apartment } from '../../shared/types';
import { totalMonthly } from '../../shared/workflow';
import { useApp } from '../state';
import { money } from '../lib/format';
import { Img, PageHeader, STATUS_DOT, Sheet, StatusBadge } from '../components/ui';
import { VoteDots } from '../components/ApartmentCard';
import { featureKey, statusKey, userKey } from '../i18n/strings';

export default function Board() {
  const { t, lang, apartments } = useApp();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const active = apartments.filter((a) => a.status !== 'rejected');
  const priced = active.filter((a) => a.price != null);
  const avg = priced.length ? Math.round(priced.reduce((s, a) => s + a.price!, 0) / priced.length) : undefined;
  const max = Math.max(1, ...PIPELINE.map((s) => apartments.filter((a) => a.status === s).length));

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));

  return (
    <main className="pt-2">
      <PageHeader
        title={t('boardTitle')}
        sub={t('boardSub')}
        end={
          <button className={`chip ${picking ? 'chip-active' : ''}`} onClick={() => { setPicking((p) => !p); setPicked([]); }}>
            <Columns3 size={16} /> {t('compare')}
          </button>
        }
        start={<span />}
      />

      <section className="mt-6 grid grid-cols-3 gap-3">
        <Stat value={active.length} label={t('inPipeline')} />
        <Stat value={money(avg, lang)} label={t('avgPrice')} />
        <Stat value={apartments.filter((a) => a.status === 'rejected').length} label={t('status.rejected')} />
      </section>

      <section className="card mt-3 p-5">
        <h2 className="section-title">{t('funnel')}</h2>
        <div className="grid gap-2">
          {PIPELINE.map((s) => {
            const n = apartments.filter((a) => a.status === s).length;
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-ink/70">{t(statusKey(s))}</span>
                <div className="h-6 flex-1 rounded-full bg-haze overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(n / max) * 100}%`, background: STATUS_DOT[s], minWidth: n ? 24 : 0 }}
                  />
                </div>
                <span className="w-6 text-end font-semibold">{n}</span>
              </div>
            );
          })}
        </div>
      </section>

      {picking && <p className="mt-6 text-center text-sm text-ink/55">{t('compareHint')}</p>}

      {ALL_STATUSES.map((s) => {
        const list = apartments.filter((a) => a.status === s);
        if (!list.length) return null;
        return (
          <section key={s} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_DOT[s] }} />
              {t(statusKey(s))}
              <span className="text-ink/35 font-normal">{list.length}</span>
            </h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
              {list.map((a) => (
                <MiniCard key={a.id} apt={a} picking={picking} picked={picked.includes(a.id)} onPick={() => toggle(a.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {picking && picked.length >= 2 && (
        <div className="fixed inset-x-0 bottom-28 z-40 flex justify-center px-4">
          <button className="btn-accent shadow-float" onClick={() => setComparing(true)}>
            <Columns3 size={18} /> {t('compare')} ({picked.length})
          </button>
        </div>
      )}

      <Sheet open={comparing} onClose={() => setComparing(false)} title={t('compareTitle')}>
        <CompareTable apts={picked.map((id) => apartments.find((a) => a.id === id)!).filter(Boolean)} />
      </Sheet>
    </main>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="card !rounded-3xl p-4">
      <div className="text-xl font-bold truncate">{value}</div>
      <div className="text-xs text-ink/50">{label}</div>
    </div>
  );
}

function MiniCard({ apt, picking, picked, onPick }: { apt: Apartment; picking: boolean; picked: boolean; onPick: () => void }) {
  const { t, lang } = useApp();
  const body = (
    <>
      <div className="relative h-28">
        <Img src={apt.images[0]} className="h-full w-full" />
        {picking && (
          <span className={`absolute top-2 end-2 flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-white ${picked ? 'bg-accent text-white' : 'bg-white/80'}`}>
            {picked && <Check size={16} />}
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold truncate">{apt.title}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm text-ink/60">{money(apt.price, lang)}{apt.rooms ? ` · ${apt.rooms} ${t('roomsShort')}` : ''}</span>
          <VoteDots apt={apt} />
        </div>
      </div>
    </>
  );
  const cls = `card snap-start shrink-0 w-52 overflow-hidden !rounded-3xl text-start transition ${picked ? 'ring-2 ring-accent' : ''}`;
  return picking ? (
    <button className={cls} onClick={onPick}>{body}</button>
  ) : (
    <Link className={cls} to={`/apt/${apt.id}`}>{body}</Link>
  );
}

function CompareTable({ apts }: { apts: Apartment[] }) {
  const { t, lang } = useApp();
  const avgRating = (a: Apartment) => {
    const r = USERS.map((u) => a.ratings[u]).filter(Boolean) as number[];
    return r.length ? (r.reduce((s, n) => s + n, 0) / r.length).toFixed(1) : '—';
  };
  const rows: [string, (a: Apartment) => React.ReactNode][] = [
    [t('pipeline'), (a) => <StatusBadge status={a.status} />],
    [t('rent'), (a) => money(a.price, lang)],
    [t('totalMonthly'), (a) => money(totalMonthly(a), lang)],
    [t('rooms'), (a) => a.rooms ?? '—'],
    [t('sqm'), (a) => a.sizeSqm ?? '—'],
    [t('floor'), (a) => a.floor ?? '—'],
    [t('neighborhood'), (a) => a.neighborhood || a.city || '—'],
    [t('entry'), (a) => a.entryDate ?? '—'],
    [t('rating'), avgRating],
    ...USERS.map((u) => [`${t('rating')} · ${t(userKey(u))}`, (a: Apartment) => a.ratings[u] ?? '—'] as [string, (a: Apartment) => React.ReactNode]),
    ...FEATURE_KEYS.map((k) => [t(featureKey(k)), (a: Apartment) => (a.features[k] ? '✓' : '—')] as [string, (a: Apartment) => React.ReactNode]),
  ];
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th />
            {apts.map((a) => (
              <th key={a.id} className="p-2 text-start align-bottom font-semibold">
                <Link to={`/apt/${a.id}`} className="line-clamp-2">{a.title}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-t border-ink/5">
              <td className="py-2 pe-3 text-ink/50 whitespace-nowrap">{label}</td>
              {apts.map((a) => <td key={a.id} className="p-2">{fn(a)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
