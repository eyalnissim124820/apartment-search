import { useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ClipboardPaste, ImagePlus, Link2, Loader2, Plus, Wand2, X, Zap, ListChecks } from 'lucide-react';
import {
  ALL_STATUSES, FEATURE_KEYS, type ApartmentInput, type Contact, type ContactRole, type ListingSource, type Status,
} from '../../shared/types';
import { sourceFromUrl } from '../../shared/parseListing';
import { overBudget } from '../../shared/workflow';
import type { ImportResult } from '../../shared/types';
import { useApp } from '../state';
import { api } from '../lib/api';
import { compressImage, fromLocalInput, money, toLocalInput } from '../lib/format';
import { FEATURE_ICON } from '../components/ui';
import { featureKey, roleKey, sourceKey, statusKey } from '../i18n/strings';

const SOURCES: ListingSource[] = ['yad2', 'facebook', 'madlan', 'homeless', 'friend', 'other'];
const NUMERIC = ['price', 'arnona', 'vaadBayit', 'rooms', 'sizeSqm', 'floor', 'totalFloors'] as const;

type Draft = Omit<ApartmentInput, (typeof NUMERIC)[number]> & Partial<Record<(typeof NUMERIC)[number], string>>;

export default function ApartmentForm() {
  const { id } = useParams();
  const { apartments, t, lang, mutate, settings, showToast } = useApp();
  const nav = useNavigate();
  const existing = id ? apartments.find((a) => a.id === id) : undefined;
  const editing = !!id;
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;

  const [mode, setMode] = useState<'quick' | 'full'>(editing ? 'full' : 'quick');
  const [status, setStatus] = useState<Status>('pending_review');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [d, setD] = useState<Draft>(() => {
    const base: Draft = { title: '', images: [], features: {}, contacts: [] };
    if (!existing) return base;
    const out: Draft = { ...base, ...existing } as unknown as Draft;
    for (const k of NUMERIC) out[k] = existing[k] != null ? String(existing[k]) : '';
    return out;
  });

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');

  if (editing && !existing) return null;

  /** Fill only fields the user hasn't typed yet. */
  const applyImport = (r: ImportResult) => {
    const data = r.data;
    setD((x) => {
      const out: Draft = { ...x };
      for (const [k, v] of Object.entries(data) as [keyof Draft, unknown][]) {
        if (v == null || v === '') continue;
        if (k === 'features') out.features = { ...(v as object), ...x.features };
        else if (k === 'images') out.images = x.images?.length ? x.images : (v as string[]);
        else if (k === 'contacts') out.contacts = x.contacts?.length ? x.contacts : (v as Draft['contacts']);
        else if ((NUMERIC as readonly string[]).includes(k)) { if (!x[k]) (out as Record<string, unknown>)[k] = String(v); }
        else if (!x[k]) (out as Record<string, unknown>)[k] = v;
      }
      return out;
    });
    const n = r.found.length;
    if (r.warning === 'blocked' || r.warning === 'empty') {
      setImportMsg({ kind: 'warn', text: t(r.warning === 'blocked' ? 'importBlocked' : 'importEmpty') });
      setPasteOpen(true);
    } else {
      setImportMsg({ kind: 'ok', text: t('importFound', { n }) });
      if (n > 3) setMode('full');
    }
  };

  const runImport = async (input: { url?: string; text?: string }) => {
    setImporting(true);
    setImportMsg(null);
    try {
      applyImport(await api.importListing(input));
      if (input.text) setPasteOpen(false);
    } catch (e) {
      showToast(`${t('error')}: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const over = overBudget(
    { price: Number(d.price) || undefined, arnona: Number(d.arnona) || undefined, vaadBayit: Number(d.vaadBayit) || undefined },
    settings?.budget,
  );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const text = (k: keyof Draft) => ({
    value: (d[k] as string) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
  });

  const submit = async () => {
    if (!d.title.trim()) { setError(true); return; }
    setBusy(true);
    // The server whitelists editable fields, so extra keys from `existing` are ignored.
    const payload: Record<string, unknown> = { ...d };
    for (const k of NUMERIC) payload[k] = d[k] === '' || d[k] == null ? '' : Number(d[k]);
    if (editing) delete payload.contacts; // contacts are managed on the detail screen
    else payload.status = status;
    try {
      const out = await mutate(() => (editing ? api.update(id!, payload) : api.create(payload as unknown as ApartmentInput)));
      if (out) nav(`/apt/${out.id}`, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="pt-safe pb-28">
      <div className="flex items-center justify-between pt-2">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="back"><Back size={20} /></button>
        {!editing && (
          <div className="flex rounded-full bg-white p-1 shadow-card">
            <ModeBtn active={mode === 'quick'} onClick={() => setMode('quick')} icon={<Zap size={15} />} label={t('quickAdd')} />
            <ModeBtn active={mode === 'full'} onClick={() => setMode('full')} icon={<ListChecks size={15} />} label={t('fullForm')} />
          </div>
        )}
      </div>

      <h1 className="mt-6 text-4xl font-bold tracking-tight">
        {editing ? t('editApartment') : mode === 'quick' ? t('quickAdd') : t('newApartment')}
      </h1>
      {mode === 'quick' && <p className="mt-1 text-ink/55">{t('quickAddSub')}</p>}

      <form
        className="mt-6 grid gap-4"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Section>
          <Field label={t('listingUrl')}>
            <div className="relative">
              <Link2 size={18} className="absolute top-1/2 -translate-y-1/2 start-4 text-ink/40" />
              <input
                className="field ps-11"
                type="url"
                dir="ltr"
                inputMode="url"
                placeholder="https://"
                value={d.listingUrl ?? ''}
                onChange={(e) => {
                  const url = e.target.value;
                  setD((x) => ({ ...x, listingUrl: url, source: x.source ?? sourceFromUrl(url) }));
                }}
                onPaste={(e) => {
                  const url = e.clipboardData.getData('text').trim();
                  if (!editing && /^https?:\/\//.test(url)) setTimeout(() => runImport({ url }), 0);
                }}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="chip !shadow-none !bg-accent-soft !text-accent"
                disabled={importing || !/^https?:\/\//.test(d.listingUrl ?? '')}
                onClick={() => runImport({ url: d.listingUrl })}
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {importing ? t('importing') : t('autoFill')}
              </button>
              <button type="button" className="chip !shadow-none !bg-haze" onClick={() => setPasteOpen((o) => !o)}>
                <ClipboardPaste size={16} /> {t('pasteText')}
              </button>
            </div>
            {importMsg && (
              <p className={`mt-2 rounded-2xl p-3 text-sm ${importMsg.kind === 'ok' ? 'bg-[#E8F7F1] text-[#0F7A55]' : 'bg-[#FFF3DF] text-[#7A4808]'}`}>
                {importMsg.text}
              </p>
            )}
            {pasteOpen && (
              <div className="mt-2 grid gap-2">
                <textarea
                  className="field !h-36 py-3 resize-none text-sm"
                  placeholder={t('pasteTextHint')}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  dir="auto"
                />
                <button
                  type="button"
                  className="btn-dark !h-11"
                  disabled={importing || !pasted.trim()}
                  onClick={() => runImport({ text: pasted, url: d.listingUrl || undefined })}
                >
                  <Wand2 size={16} /> {t('parseText')}
                </button>
              </div>
            )}
          </Field>
          <Field label={`${t('title')} *`}>
            <input
              className={`field ${error && !d.title.trim() ? '!border-[#E5484D]' : ''}`}
              placeholder={t('titlePlaceholder')}
              {...text('title')}
              dir="auto"
            />
            {error && !d.title.trim() && <p className="mt-1 ps-1 text-xs text-[#E5484D]">{t('required')}</p>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('price')}>
              <input className={`field ${over ? '!border-[#E5484D]' : ''}`} inputMode="numeric" type="number" placeholder="₪" {...text('price')} />
              {over > 0 && <p className="mt-1 ps-1 text-xs text-[#B42318]">{t('overBudgetLong', { amount: money(over, lang) })}</p>}
            </Field>
            <Field label={t('city')}>
              <input className="field" {...text('city')} dir="auto" />
            </Field>
          </div>
          <Field label={t('source')}>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => set('source', d.source === s ? undefined : s)}
                  className={`chip !shadow-none !h-9 ${d.source === s ? 'chip-active' : '!bg-haze'}`}
                >
                  {t(sourceKey(s))}
                </button>
              ))}
            </div>
          </Field>
        </Section>

        {mode === 'full' && (
          <>
            <Section title={t('location')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('neighborhood')}><input className="field" {...text('neighborhood')} dir="auto" /></Field>
                <Field label={t('address')}><input className="field" {...text('address')} dir="auto" /></Field>
              </div>
            </Section>

            <Section title={t('property')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('rooms')}><input className="field" type="number" step="0.5" inputMode="decimal" {...text('rooms')} /></Field>
                <Field label={`${t('size')} (${t('sqm')})`}><input className="field" type="number" inputMode="numeric" {...text('sizeSqm')} /></Field>
                <Field label={t('floor')}><input className="field" type="number" inputMode="numeric" {...text('floor')} /></Field>
                <Field label={t('totalFloors')}><input className="field" type="number" inputMode="numeric" {...text('totalFloors')} /></Field>
                <Field label={t('entryDate')}><input className="field" type="date" {...text('entryDate')} /></Field>
                <Field label={t('viewingAt')}>
                  <input
                    className="field"
                    type="datetime-local"
                    value={toLocalInput(d.viewingAt)}
                    onChange={(e) => set('viewingAt', fromLocalInput(e.target.value))}
                  />
                </Field>
              </div>
              <Field label={t('features')}>
                <div className="flex flex-wrap gap-2">
                  {FEATURE_KEYS.map((k) => {
                    const Icon = FEATURE_ICON[k];
                    const on = !!d.features?.[k];
                    return (
                      <button
                        type="button"
                        key={k}
                        onClick={() => set('features', { ...d.features, [k]: !on })}
                        className={`chip !shadow-none !h-10 ${on ? 'chip-active' : '!bg-haze'}`}
                      >
                        <Icon size={16} /> {t(featureKey(k))}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </Section>

            <Section title={t('money')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('arnona')}><input className="field" type="number" inputMode="numeric" placeholder="₪" {...text('arnona')} /></Field>
                <Field label={t('vaadBayit')}><input className="field" type="number" inputMode="numeric" placeholder="₪" {...text('vaadBayit')} /></Field>
              </div>
            </Section>

            <Section title={t('photos')}>
              <Photos images={d.images ?? []} onChange={(imgs) => set('images', imgs)} />
            </Section>

            <Section title={t('description')}>
              <textarea className="field !h-32 py-3 resize-none" {...text('description')} dir="auto" />
            </Section>
          </>
        )}

        {!editing && (
          <Section title={t('contacts')}>
            <ContactsEditor contacts={d.contacts ?? []} onChange={(c) => set('contacts', c)} />
          </Section>
        )}

        {!editing && mode === 'full' && (
          <Section title={t('initialStatus')}>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{t(statusKey(s))}</option>)}
            </select>
          </Section>
        )}

        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-safe pointer-events-none">
          <div className="mx-auto max-w-2xl flex gap-2 pointer-events-auto">
            <button type="submit" className="btn-dark flex-1 !h-14 text-lg shadow-float" disabled={busy}>
              {busy ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function ModeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3.5 h-10 text-sm font-medium transition ${active ? 'bg-ink text-white' : 'text-ink/55'}`}
    >
      {icon} {label}
    </button>
  );
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="card p-5 grid gap-4">
      {title && <h2 className="text-lg font-semibold -mb-1">{title}</h2>}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function Photos({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const { t } = useApp();
  const [url, setUrl] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const addUrl = () => {
    if (!url.trim()) return;
    onChange([...images, url.trim()]);
    setUrl('');
  };
  return (
    <div className="grid gap-3">
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {images.map((src, i) => (
            <div key={i} className="relative shrink-0">
              <img src={src} alt="" className="h-24 w-32 rounded-2xl object-cover" />
              <button
                type="button"
                className="absolute top-1 end-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="field"
          type="url"
          dir="ltr"
          placeholder={t('addPhotoUrl')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }}
        />
        <button type="button" className="icon-btn !shadow-none bg-haze" onClick={addUrl} aria-label={t('addPhotoUrl')}>
          <Plus size={18} />
        </button>
      </div>
      <button type="button" className="btn-light !shadow-none bg-haze" onClick={() => file.current?.click()}>
        <ImagePlus size={18} /> {t('uploadPhotos')}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          const out = await Promise.all(files.map((f) => compressImage(f)));
          onChange([...images, ...out]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function ContactsEditor({ contacts, onChange }: { contacts: Contact[]; onChange: (c: Contact[]) => void }) {
  const { t } = useApp();
  const update = (i: number, patch: Partial<Contact>) => onChange(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const ROLES: ContactRole[] = ['contact', 'owner', 'agent'];
  return (
    <div className="grid gap-3">
      {contacts.map((c, i) => (
        <div key={i} className="rounded-3xl bg-haze p-3 grid gap-2">
          <div className="flex items-center gap-2">
            <select className="field !h-10 !w-auto !bg-white text-sm" value={c.role} onChange={(e) => update(i, { role: e.target.value as ContactRole })}>
              {ROLES.map((r) => <option key={r} value={r}>{t(roleKey(r))}</option>)}
            </select>
            <span className="flex-1" />
            <button type="button" className="p-2 text-ink/40" onClick={() => onChange(contacts.filter((_, j) => j !== i))}>
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="field !bg-white" placeholder={t('name')} value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
            <input className="field !bg-white" placeholder={t('phone')} type="tel" dir="ltr" value={c.phone ?? ''} onChange={(e) => update(i, { phone: e.target.value })} />
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-light !shadow-none bg-haze"
        onClick={() => onChange([...contacts, { id: '', role: 'contact', name: '' }])}
      >
        <Plus size={18} /> {t('addContact')}
      </button>
    </div>
  );
}
