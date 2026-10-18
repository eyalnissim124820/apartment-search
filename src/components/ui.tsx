import { useEffect, useState, type ReactNode } from 'react';
import {
  Accessibility, Archive, Building2, Check, Dog, Hammer, ShieldCheck, Snowflake, Sofa, SquareParking, Sun, X,
  ArrowUpDown,
} from 'lucide-react';
import type { Features, Status, UserId } from '../../shared/types';
import { useApp } from '../state';
import { statusKey, userKey } from '../i18n/strings';

export const USER_STYLE: Record<UserId, string> = {
  eyal: 'bg-gradient-to-br from-[#5B7CFF] to-[#1F4BFF] text-white',
  ofir: 'bg-gradient-to-br from-[#FFB36B] to-[#FF6B8B] text-white',
};

export function Avatar({ user, size = 44, ring }: { user: UserId; size?: number; ring?: boolean }) {
  const { t } = useApp();
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold shrink-0 ${USER_STYLE[user]} ${
        ring ? 'ring-2 ring-white' : ''
      }`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-label={t(userKey(user))}
    >
      {t(userKey(user)).slice(0, 2)}
    </span>
  );
}

export const STATUS_STYLE: Record<Status, string> = {
  pending_review: 'bg-[#F1F1F5] text-ink/70',
  relevant: 'bg-[#E3E8FF] text-[#1F3BCC]',
  contacted: 'bg-[#E6F4FF] text-[#0B6BB5]',
  responded: 'bg-[#E8F7F1] text-[#0F7A55]',
  approved: 'bg-[#E9F9E3] text-[#2F7D12]',
  proceed_with_owner: 'bg-[#FFF3DF] text-[#A2600B]',
  contract: 'bg-ink text-white',
  rejected: 'bg-[#FDECEC] text-[#B42318]',
};

export const STATUS_DOT: Record<Status, string> = {
  pending_review: '#A3A3B2',
  relevant: '#1F4BFF',
  contacted: '#1E90E8',
  responded: '#14B37D',
  approved: '#4CB524',
  proceed_with_owner: '#F09A19',
  contract: '#0E0F12',
  rejected: '#E5484D',
};

export function StatusBadge({ status, className = '' }: { status: Status; className?: string }) {
  const { t } = useApp();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 h-7 text-xs font-semibold ${STATUS_STYLE[status]} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: status === 'contract' ? '#fff' : STATUS_DOT[status] }} />
      {t(statusKey(status))}
    </span>
  );
}

export const FEATURE_ICON: Record<keyof Features, typeof Check> = {
  safeRoom: ShieldCheck,
  parking: SquareParking,
  elevator: ArrowUpDown,
  balcony: Sun,
  airConditioning: Snowflake,
  furnished: Sofa,
  petsAllowed: Dog,
  storage: Archive,
  accessible: Accessibility,
  renovated: Hammer,
};

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal>
      <button className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} aria-label="close" />
      <div className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-4xl sm:rounded-4xl bg-white p-5 pb-safe animate-sheet">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink/10 sm:hidden" />
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button className="icon-btn !h-10 !w-10 !shadow-none bg-haze" onClick={onClose} aria-label="close">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Toast() {
  const { toast, offline, t } = useApp();
  const msg = toast ?? (offline ? t('offline') : null);
  if (!msg) return null;
  return (
    <div className="fixed inset-x-0 top-3 z-[60] flex justify-center px-4 pointer-events-none">
      <div className="animate-rise rounded-full bg-ink text-white text-sm px-5 py-3 shadow-float max-w-md text-center">{msg}</div>
    </div>
  );
}

export function Stars({ value, onChange, size = 22 }: { value?: number; onChange?: (n: number) => void; size?: number }) {
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className="disabled:cursor-default"
          aria-label={`${n}`}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" className={n <= (value ?? 0) ? 'fill-[#FFB020]' : 'fill-ink/10'}>
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function Placeholder({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-[#E9ECF7] to-[#D9DEF0] text-ink/25 ${className}`}>
      <Building2 size={48} strokeWidth={1.2} />
    </div>
  );
}

export function PageHeader({ title, sub, start, end }: { title: string; sub?: string; start?: ReactNode; end?: ReactNode }) {
  return (
    <header className="pt-safe">
      {(start || end) && (
        <div className="flex items-center justify-between mb-4">
          {start ?? <span />}
          {end}
        </div>
      )}
      <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight whitespace-pre-line">{title}</h1>
      {sub && <p className="mt-2 text-ink/55">{sub}</p>}
    </header>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center animate-rise">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-haze">
        <Building2 className="text-ink/40" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1 text-ink/55">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Image that falls back to the placeholder when the URL is broken or blocked. */
export function Img({ src, className = '', alt = '' }: { src?: string; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <Placeholder className={className} />;
  return <img src={src} alt={alt} loading="lazy" draggable={false} className={`object-cover ${className}`} onError={() => setFailed(true)} />;
}
