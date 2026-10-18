import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BedDouble, Heart, Info, MapPin, Maximize, X } from 'lucide-react';
import type { Apartment, Vote } from '../../shared/types';
import { awaitsVoteFrom, nextStatus, otherUser } from '../../shared/workflow';
import { useApp } from '../state';
import { api } from '../lib/api';
import { money } from '../lib/format';
import { Avatar, Empty, Img, PageHeader, StatusBadge } from '../components/ui';
import { statusKey, userKey, type StringKey } from '../i18n/strings';

const THRESHOLD = 110;

export default function Match() {
  const { t, apartments, user, mutate } = useApp();
  const me = user!;
  // Snapshot the queue order so cards don't reshuffle while polling refreshes.
  const [skipped, setSkipped] = useState<string[]>([]);
  const queue = useMemo(
    () =>
      apartments
        .filter((a) => awaitsVoteFrom(a, me) && !skipped.includes(a.id))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [apartments, me, skipped],
  );
  const [match, setMatch] = useState<Apartment | null>(null);

  const decide = async (apt: Apartment, vote: Vote) => {
    setSkipped((s) => [...s, apt.id]);
    const out = await mutate(() => api.vote(apt.id, vote)).catch(() => null);
    if (out && vote === 'approve' && out.status !== apt.status) setMatch(out);
  };

  return (
    <main className="pt-2">
      <PageHeader title={t('matchTitle')} sub={t('matchSub')} />
      <div className="relative mx-auto mt-6 h-[min(64dvh,560px)] max-w-md">
        {queue.length === 0 ? (
          <Empty title={t('matchEmpty')} body={t('matchEmptySub')} />
        ) : (
          queue
            .slice(0, 3)
            .reverse()
            .map((apt, i, arr) => (
              <SwipeCard
                key={apt.id}
                apt={apt}
                depth={arr.length - 1 - i}
                onDecide={(v) => decide(apt, v)}
              />
            ))
        )}
      </div>
      {queue.length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-6" dir="ltr">
          <button
            className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-[#E5484D] shadow-float active:scale-90 transition"
            onClick={() => decide(queue[0], 'reject')}
            aria-label={t('reject')}
          >
            <X size={30} />
          </button>
          <Link
            to={`/apt/${queue[0].id}`}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink/60 shadow-card"
            aria-label={t('details')}
          >
            <Info size={20} />
          </Link>
          <button
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white shadow-float active:scale-90 transition"
            onClick={() => decide(queue[0], 'approve')}
            aria-label={t('approve')}
          >
            <Heart size={28} className="fill-white" />
          </button>
        </div>
      )}
      {match && <MatchOverlay apt={match} onClose={() => setMatch(null)} />}
    </main>
  );
}

function SwipeCard({ apt, depth, onDecide }: { apt: Apartment; depth: number; onDecide: (v: Vote) => void }) {
  const { t, lang, user } = useApp();
  const partner = otherUser(user!);
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<Vote | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const top = depth === 0;

  const release = () => {
    if (!start.current) return;
    start.current = null;
    if (Math.abs(dx) > THRESHOLD) {
      const v: Vote = dx > 0 ? 'approve' : 'reject';
      setLeaving(v);
      window.setTimeout(() => onDecide(v), 200);
    } else setDx(0);
  };

  const x = leaving ? (leaving === 'approve' ? 600 : -600) : dx;
  const partnerVote = apt.votes[partner];
  const place = [apt.neighborhood, apt.city].filter(Boolean).join(', ');
  const next = nextStatus(apt.status);

  return (
    <div
      className="absolute inset-0 touch-none select-none"
      style={{
        transform: `translateY(${depth * 14}px) scale(${1 - depth * 0.05}) translateX(${x}px) rotate(${x / 18}deg)`,
        transition: start.current ? 'none' : 'transform .25s ease',
        zIndex: 10 - depth,
        opacity: depth > 1 ? 0.6 : 1,
      }}
      onPointerDown={(e) => {
        if (!top) return;
        start.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => start.current && setDx(e.clientX - start.current.x)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-white shadow-float">
        <Img src={apt.images[0]} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" />

        {top && (
          <>
            <span
              className="absolute top-8 left-6 -rotate-12 rounded-2xl border-4 border-[#14B37D] px-4 py-1 text-3xl font-extrabold text-[#14B37D] bg-white/80"
              style={{ opacity: Math.max(0, x / THRESHOLD) }}
            >
              {t('approve')}
            </span>
            <span
              className="absolute top-8 right-6 rotate-12 rounded-2xl border-4 border-[#E5484D] px-4 py-1 text-3xl font-extrabold text-[#E5484D] bg-white/80"
              style={{ opacity: Math.max(0, -x / THRESHOLD) }}
            >
              {t('reject')}
            </span>
          </>
        )}

        <div className="absolute inset-x-0 top-0 flex justify-between p-4">
          <StatusBadge status={apt.status} className="bg-white/90 !text-ink" />
          {partnerVote && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/90 ps-1 pe-3 h-8 text-xs font-medium">
              <Avatar user={partner} size={24} />
              {t(partnerVote === 'approve' ? 'otherVoted' : 'otherRejected', { name: t(userKey(partner)) })}
            </span>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          {next && (
            <p className="mb-2 inline-block rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs">
              {t(`advance.${apt.status}` as StringKey)} → {t(statusKey(next))}
            </p>
          )}
          <h2 className="text-3xl font-bold leading-tight">{apt.title}</h2>
          {place && (
            <p className="mt-1 flex items-center gap-1 text-white/75"><MapPin size={15} /> {place}</p>
          )}
          <div className="mt-4 flex items-end justify-between">
            <div className="text-3xl font-bold">{money(apt.price, lang)}</div>
            <div className="flex gap-3 text-white/85">
              {apt.rooms != null && <span className="flex items-center gap-1"><BedDouble size={17} /> {apt.rooms}</span>}
              {apt.sizeSqm != null && <span className="flex items-center gap-1"><Maximize size={16} /> {apt.sizeSqm}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchOverlay({ apt, onClose }: { apt: Apartment; onClose: () => void }) {
  const { t } = useApp();
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#1F4BFF] to-[#0E0F12] p-8 text-center text-white">
      <div className="animate-pop">
        <div className="flex justify-center -space-x-4 rtl:space-x-reverse">
          <Avatar user="eyal" size={96} ring />
          <Avatar user="ofir" size={96} ring />
        </div>
        <h2 className="mt-8 text-5xl font-extrabold tracking-tight">{t('itsAMatch')}</h2>
        <p className="mt-3 text-lg text-white/75">{apt.title}</p>
        <p className="mt-1 text-white/60">{t('matchMovedTo', { status: t(statusKey(apt.status)) })}</p>
      </div>
      <div className="mt-10 grid w-full max-w-xs gap-3">
        <Link to={`/apt/${apt.id}`} className="btn bg-white text-ink">{t('details')}</Link>
        <button className="btn bg-white/10 text-white" onClick={onClose}>{t('startMatching')}</button>
      </div>
    </div>
  );
}
