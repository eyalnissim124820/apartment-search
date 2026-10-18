import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { useApp } from '../state';
import { dateTime, time } from '../lib/format';
import { PageHeader, StatusBadge } from '../components/ui';

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function Calendar() {
  const { t, lang, apartments } = useApp();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);
  const locale = lang === 'he' ? 'he-IL' : 'en-IL';

  const viewings = useMemo(
    () =>
      apartments
        .filter((a) => a.viewingAt && a.status !== 'rejected')
        .sort((a, b) => a.viewingAt!.localeCompare(b.viewingAt!)),
    [apartments],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, typeof viewings>();
    for (const a of viewings) {
      const k = dayKey(new Date(a.viewingAt!));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [viewings]);

  // Week starts on Sunday (Israeli convention).
  const first = cursor.getDay();
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)),
  ];
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 8, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  );
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const Prev = lang === 'he' ? ChevronRight : ChevronLeft;
  const Next = lang === 'he' ? ChevronLeft : ChevronRight;
  const dayList = byDay.get(dayKey(selected)) ?? [];
  const upcoming = viewings.filter((a) => new Date(a.viewingAt!) >= new Date(today.toDateString()));

  return (
    <main className="pt-2">
      <PageHeader title={t('calendarTitle')} />
      <section className="card mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl">
            <span className="font-semibold">{cursor.toLocaleDateString(locale, { month: 'long' })}</span>{' '}
            <span className="text-ink/40">{cursor.getFullYear()}</span>
          </h2>
          <div className="flex gap-1">
            <button className="icon-btn !h-10 !w-10 !shadow-none bg-haze" onClick={() => shift(-1)}><Prev size={18} /></button>
            <button className="icon-btn !h-10 !w-10 !shadow-none bg-haze" onClick={() => shift(1)}><Next size={18} /></button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-y-2 text-center">
          {weekdays.map((w) => <div key={w} className="text-xs text-ink/50 pb-1">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const has = byDay.has(dayKey(d));
            const isSel = dayKey(d) === dayKey(selected);
            const isToday = dayKey(d) === dayKey(today);
            return (
              <button
                key={i}
                onClick={() => setSelected(d)}
                className={`mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-sm transition ${
                  has ? 'bg-accent text-white font-semibold' : isToday ? 'bg-haze font-semibold' : 'text-ink/80'
                } ${isSel ? 'ring-2 ring-ink ring-offset-2' : ''}`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-3">
        <h2 className="section-title !mb-0">{selected.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        {dayList.length === 0 && <p className="text-ink/45">{t('calendarEmpty')}</p>}
        {dayList.map((a) => (
          <Link key={a.id} to={`/apt/${a.id}`} className="card flex items-center gap-4 p-4">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Clock size={16} />
              <span className="text-xs font-semibold">{time(a.viewingAt!, lang)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{a.title}</div>
              {(a.address || a.city) && (
                <div className="flex items-center gap-1 text-sm text-ink/55 truncate"><MapPin size={13} /> {[a.address, a.city].filter(Boolean).join(', ')}</div>
              )}
            </div>
            <StatusBadge status={a.status} />
          </Link>
        ))}
      </section>

      <section className="mt-8 grid gap-2">
        <h2 className="section-title !mb-1">{t('upcomingViewings')}</h2>
        {upcoming.length === 0 && <p className="text-ink/45">{t('noViewings')}</p>}
        {upcoming.map((a) => (
          <Link key={a.id} to={`/apt/${a.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-4 py-3">
            <span className="font-medium truncate">{a.title}</span>
            <span className="text-sm text-ink/55 shrink-0">{dateTime(a.viewingAt, lang)}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
