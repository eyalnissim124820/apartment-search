import { Car } from 'lucide-react';
import { USERS, type Apartment } from '../../shared/types';
import { useApp } from '../state';
import { Avatar } from './ui';

/** Compact "🚗 E 18′ · O 25′" chip row used on cards and the map. */
export function CommuteChips({ apt, dark }: { apt: Apartment; dark?: boolean }) {
  const { t } = useApp();
  const entries = USERS.filter((u) => apt.commute?.[u]);
  if (!entries.length) return null;
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${dark ? 'text-white/85' : 'text-ink/60'}`}>
      <Car size={14} />
      {entries.map((u) => (
        <span key={u} className="inline-flex items-center gap-1">
          <Avatar user={u} size={16} />
          {apt.commute![u]!.estimated ? '~' : ''}
          {apt.commute![u]!.minutes} {t('min')}
        </span>
      ))}
    </span>
  );
}

/** Worst (longest) commute across both partners – used for sorting. */
export const maxCommute = (apt: Apartment) =>
  Math.max(...USERS.map((u) => apt.commute?.[u]?.minutes ?? Infinity));
