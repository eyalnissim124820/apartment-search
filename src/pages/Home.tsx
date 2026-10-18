import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Heart, Search, Sparkles, MessagesSquare } from 'lucide-react';
import { ALL_STATUSES, USERS, type Apartment, type Status } from '../../shared/types';
import { awaitsVoteFrom, nextStatus, statusIndex } from '../../shared/workflow';
import { useApp } from '../state';
import { TopBar } from '../components/TopBar';
import { ApartmentCard } from '../components/ApartmentCard';
import { Empty, STATUS_DOT } from '../components/ui';
import { statusKey, type StringKey } from '../i18n/strings';

type Filter = 'active' | 'all' | 'mine' | 'split' | 'fav' | Status;
type Sort = 'newest' | 'priceLow' | 'priceHigh' | 'rating' | 'progress';

const SORTS: [Sort, StringKey][] = [
  ['newest', 'sortNewest'],
  ['progress', 'sortProgress'],
  ['rating', 'sortRating'],
  ['priceLow', 'sortPriceLow'],
  ['priceHigh', 'sortPriceHigh'],
];

const isSplit = (a: Apartment) => nextStatus(a.status) && USERS.every((u) => a.votes[u]) &&
  new Set(USERS.map((u) => a.votes[u])).size > 1;

const jointRating = (a: Apartment) => {
  const r = Object.values(a.ratings);
  return r.length ? r.reduce((s, n) => s + (n ?? 0), 0) / r.length : 0;
};

export default function Home() {
  const { t, apartments, user, loaded, lang } = useApp();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('f') as Filter) || 'active';
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;

  const myQueue = apartments.filter((a) => user && awaitsVoteFrom(a, user));

  const counts = useMemo(() => {
    const c: Partial<Record<Filter, number>> = {
      all: apartments.length,
      active: apartments.filter((a) => a.status !== 'rejected').length,
      mine: myQueue.length,
      split: apartments.filter(isSplit).length,
      fav: apartments.filter((a) => user && a.favorites.includes(user)).length,
    };
    for (const s of ALL_STATUSES) c[s] = apartments.filter((a) => a.status === s).length;
    return c;
  }, [apartments, myQueue.length, user]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = apartments.filter((a) => {
      if (filter === 'active' && a.status === 'rejected') return false;
      if (filter === 'mine' && !(user && awaitsVoteFrom(a, user))) return false;
      if (filter === 'split' && !isSplit(a)) return false;
      if (filter === 'fav' && !(user && a.favorites.includes(user))) return false;
      if (ALL_STATUSES.includes(filter as Status) && a.status !== filter) return false;
      if (needle) {
        const hay = [a.title, a.city, a.neighborhood, a.address, a.description].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const by: Record<Sort, (a: Apartment, b: Apartment) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      priceLow: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
      priceHigh: (a, b) => (b.price ?? -1) - (a.price ?? -1),
      rating: (a, b) => jointRating(b) - jointRating(a),
      progress: (a, b) => statusIndex(b.status) - statusIndex(a.status),
    };
    return out.sort(by[sort]);
  }, [apartments, filter, q, sort, user]);

  const setFilter = (f: Filter) => setParams(f === 'active' ? {} : { f }, { replace: true });

  const chips: { key: Filter; label: string; icon?: JSX.Element; dot?: string }[] = [
    { key: 'active', label: t('active') },
    { key: 'mine', label: t('needsMyVote'), icon: <Sparkles size={14} /> },
    { key: 'split', label: t('needsDiscussion'), icon: <MessagesSquare size={14} /> },
    { key: 'fav', label: t('favorites'), icon: <Heart size={14} /> },
    ...ALL_STATUSES.map((s) => ({ key: s as Filter, label: t(statusKey(s)), dot: STATUS_DOT[s] })),
    { key: 'all', label: t('all') },
  ];

  return (
    <main className="pt-2">
      <TopBar />
      <h1 className="mt-8 text-[2.75rem] sm:text-6xl font-bold leading-[1.02] tracking-tight whitespace-pre-line">
        {t('homeTitle')}
      </h1>

      {myQueue.length > 0 && (
        <Link
          to="/match"
          className="mt-6 flex items-center gap-3 rounded-full bg-ink p-2 ps-2 pe-5 text-white shadow-float animate-rise"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
            <Sparkles size={20} />
          </span>
          <span className="flex-1 font-medium">{t('waitingForYou', { n: myQueue.length })}</span>
          <span className="flex items-center gap-1 text-white/70 text-sm">
            {t('startMatching')} <Arrow size={16} />
          </span>
        </Link>
      )}

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
        {chips
          .filter((c) => c.key === 'active' || c.key === 'all' || counts[c.key])
          .map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`chip ${filter === c.key ? 'chip-active' : ''}`}
            >
              {c.dot && <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />}
              {c.icon}
              {c.label}
              <span className={`text-xs ${filter === c.key ? 'text-white/60' : 'text-ink/40'}`}>{counts[c.key] ?? 0}</span>
            </button>
          ))}
      </div>

      <div className="mt-3 flex gap-2">
        <label className="relative flex-1">
          <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-4 text-ink/40" />
          <input
            className="field !bg-white shadow-card ps-11 !rounded-full"
            placeholder={t('search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          className="field !w-auto !bg-white shadow-card !rounded-full text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          {SORTS.map(([k, label]) => (
            <option key={k} value={k}>{t(label)}</option>
          ))}
        </select>
      </div>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        {list.map((a) => (
          <ApartmentCard key={a.id} apt={a} />
        ))}
      </section>

      {loaded && list.length === 0 && (
        <div className="mt-2">
          {apartments.length === 0 ? (
            <Empty
              title={t('emptyTitle')}
              body={t('emptyBody')}
              action={<Link to="/new" className="btn-accent">{t('addFirst')}</Link>}
            />
          ) : (
            <Empty title={t('emptyFiltered')} />
          )}
        </div>
      )}
    </main>
  );
}
