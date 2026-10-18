import { Link } from 'react-router-dom';
import { BedDouble, Heart, MapPin, Maximize, CalendarClock } from 'lucide-react';
import { USERS, type Apartment } from '../../shared/types';
import { useApp } from '../state';
import { money, dateTime } from '../lib/format';
import { Avatar, Img, StatusBadge } from './ui';
import { nextStatus, overBudget } from '../../shared/workflow';
import { CommuteChips } from './Commute';

export function VoteDots({ apt }: { apt: Apartment }) {
  if (!nextStatus(apt.status)) return null;
  return (
    <div className="flex -space-x-2 rtl:space-x-reverse">
      {USERS.map((u) => {
        const v = apt.votes[u];
        return (
          <span key={u} className={`relative rounded-full ${v ? '' : 'opacity-35 grayscale'}`}>
            <Avatar user={u} size={28} ring />
            {v && (
              <span
                className={`absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${
                  v === 'approve' ? 'bg-[#14B37D]' : 'bg-[#E5484D]'
                }`}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

export function ApartmentCard({ apt }: { apt: Apartment }) {
  const { t, lang, user, settings } = useApp();
  const over = overBudget(apt, settings?.budget);
  const cover = apt.images[0];
  const place = [apt.neighborhood, apt.city].filter(Boolean).join(', ');
  const fav = user ? apt.favorites.includes(user) : false;
  return (
    <Link to={`/apt/${apt.id}`} className="card block overflow-hidden animate-rise active:scale-[.99] transition">
      <div className="relative h-44 sm:h-52">
        <Img src={cover} className="h-full w-full" />
        <div className="absolute inset-x-3 top-3 flex items-start justify-between">
          <StatusBadge status={apt.status} className="bg-white/90 backdrop-blur text-ink" />
          {fav && (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 backdrop-blur">
              <Heart size={16} className="fill-[#FF4D6D] text-[#FF4D6D]" />
            </span>
          )}
        </div>
        {apt.viewingAt && new Date(apt.viewingAt) > new Date() && (
          <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-accent text-white text-xs font-medium px-3 h-7">
            <CalendarClock size={14} /> {dateTime(apt.viewingAt, lang)}
          </span>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-2xl font-bold leading-tight tracking-tight line-clamp-2">{apt.title}</h3>
            {place && (
              <p className="mt-1 flex items-center gap-1 text-sm text-ink/55 truncate">
                <MapPin size={14} className="shrink-0" /> {place}
              </p>
            )}
          </div>
          <VoteDots apt={apt} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <div className={`text-2xl font-bold ${over ? 'text-[#B42318]' : ''}`}>{money(apt.price, lang)}</div>
            <div className="text-xs text-ink/45">
              {over ? <span className="font-medium text-[#B42318]">{t('overBudget', { amount: money(over, lang) })}</span> : t('perMonth')}
            </div>
          </div>
          <div className="flex gap-3 text-sm text-ink/65">
            {apt.rooms != null && (
              <span className="flex items-center gap-1">
                <BedDouble size={16} /> {apt.rooms}
              </span>
            )}
            {apt.sizeSqm != null && (
              <span className="flex items-center gap-1">
                <Maximize size={15} /> {apt.sizeSqm} {t('sqm')}
              </span>
            )}
          </div>
        </div>
        {apt.commute && <div className="mt-3 border-t border-ink/5 pt-3"><CommuteChips apt={apt} /></div>}
      </div>
    </Link>
  );
}
