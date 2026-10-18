import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { CHECKLIST_KEYS, type Apartment, type ChecklistKey, type CheckState } from '../../shared/types';
import { useApp } from '../state';
import { api } from '../lib/api';
import { Avatar } from '../components/ui';
import { checkKey } from '../i18n/strings';

export function checklistSummary(apt: Apartment) {
  const items = Object.values(apt.checklist ?? {});
  return {
    done: items.filter((i) => i?.state).length,
    issues: items.filter((i) => i?.state === 'issue').length,
    total: CHECKLIST_KEYS.length,
  };
}

/** Full-screen, thumb-friendly checklist for use while standing in the apartment. */
export default function Checklist() {
  const { id } = useParams();
  const { apartments, t, lang } = useApp();
  const nav = useNavigate();
  const apt = apartments.find((a) => a.id === id);
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;
  if (!apt) return null;
  const { done, issues, total } = checklistSummary(apt);

  return (
    <main className="pt-safe">
      <div className="flex items-center justify-between pt-2">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="back"><Back size={20} /></button>
        <span className="chip !shadow-none">
          {t('checklistProgress', { done, total })}
          {issues > 0 && <span className="text-[#B42318]">· {t('checklistIssues', { n: issues })}</span>}
        </span>
      </div>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">{t('checklist')}</h1>
      <p className="mt-1 text-ink/55">{apt.title}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <div className="mt-6 grid gap-3">
        {CHECKLIST_KEYS.map((k) => <Row key={k} apt={apt} k={k} />)}
      </div>
    </main>
  );
}

function Row({ apt, k }: { apt: Apartment; k: ChecklistKey }) {
  const { t, mutate } = useApp();
  const item = apt.checklist?.[k];
  const [note, setNote] = useState(item?.note ?? '');
  const set = (state: CheckState) =>
    mutate(() => api.checklist(apt.id, k, { state: item?.state === state ? null : state }));
  const saveNote = () => note !== (item?.note ?? '') && mutate(() => api.checklist(apt.id, k, { note }));

  return (
    <div
      className={`card p-4 transition ${
        item?.state === 'ok' ? 'ring-2 ring-[#14B37D]/40' : item?.state === 'issue' ? 'ring-2 ring-[#E5484D]/40' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex-1 font-semibold">{t(checkKey(k))}</span>
        {item?.by && <Avatar user={item.by} size={22} />}
        <button
          onClick={() => set('issue')}
          className={`flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium transition ${
            item?.state === 'issue' ? 'bg-[#E5484D] text-white' : 'bg-haze text-ink/60'
          }`}
        >
          <TriangleAlert size={16} /> {t('issue')}
        </button>
        <button
          onClick={() => set('ok')}
          className={`flex h-11 items-center gap-1 rounded-full px-3 text-sm font-medium transition ${
            item?.state === 'ok' ? 'bg-[#14B37D] text-white' : 'bg-haze text-ink/60'
          }`}
        >
          <Check size={16} /> {t('ok')}
        </button>
      </div>
      <input
        className="mt-3 h-10 w-full rounded-xl bg-haze px-3 text-sm placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-accent"
        placeholder={t('addNote')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        dir="auto"
      />
    </div>
  );
}
