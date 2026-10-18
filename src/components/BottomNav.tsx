import { NavLink } from 'react-router-dom';
import { CalendarDays, Home, Plus, SquareKanban, Sparkles } from 'lucide-react';
import { useApp } from '../state';
import { awaitsVoteFrom } from '../../shared/workflow';

export function BottomNav() {
  const { t, apartments, user } = useApp();
  const pending = user ? apartments.filter((a) => awaitsVoteFrom(a, user)).length : 0;
  const item = (to: string, Icon: typeof Home, label: string, badge?: number) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium transition ${
          isActive ? 'bg-ink text-white' : 'text-ink/50'
        }`
      }
    >
      <Icon size={20} />
      <span>{label}</span>
      {!!badge && (
        <span className="absolute top-1.5 end-[calc(50%-18px)] min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[10px] leading-[18px] text-center">
          {badge}
        </span>
      )}
    </NavLink>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-safe px-4 pointer-events-none">
      <div className="mx-auto max-w-md flex items-center gap-1 rounded-full bg-white/90 backdrop-blur-xl p-1.5 shadow-float pointer-events-auto">
        {item('/', Home, t('nav.home'))}
        {item('/match', Sparkles, t('nav.match'), pending)}
        <NavLink
          to="/new"
          className="mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_8px_24px_-8px_rgba(31,75,255,.8)] active:scale-95 transition"
          aria-label={t('nav.add')}
        >
          <Plus size={26} />
        </NavLink>
        {item('/board', SquareKanban, t('nav.board'))}
        {item('/calendar', CalendarDays, t('nav.calendar'))}
      </div>
    </nav>
  );
}
