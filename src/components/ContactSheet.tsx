import { useEffect, useState } from 'react';
import type { Contact, ContactRole } from '../../shared/types';
import { useApp } from '../state';
import { Sheet } from './ui';
import { roleKey } from '../i18n/strings';

const ROLES: ContactRole[] = ['contact', 'owner', 'agent'];

export function ContactSheet({
  open, onClose, initial, title, onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<Contact>;
  title?: string;
  onSave: (c: Partial<Contact>) => Promise<unknown>;
}) {
  const { t } = useApp();
  const [c, setC] = useState<Partial<Contact>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setC({ role: 'contact', ...initial }); }, [open, initial]);

  const set = (k: keyof Contact) => (e: { target: { value: string } }) => setC((x) => ({ ...x, [k]: e.target.value }));
  const valid = !!(c.name?.trim() || c.phone?.trim());

  return (
    <Sheet open={open} onClose={onClose} title={title ?? t('addContact')}>
      {title === t('ownerPromptTitle') && <p className="-mt-2 mb-4 text-ink/60">{t('ownerPromptBody')}</p>}
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          try { await onSave(c); onClose(); } finally { setBusy(false); }
        }}
      >
        <div>
          <span className="field-label">{t('role')}</span>
          <div className="flex gap-2">
            {ROLES.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setC((x) => ({ ...x, role: r }))}
                className={`chip !shadow-none flex-1 justify-center ${c.role === r ? 'chip-active' : '!bg-haze'}`}
              >
                {t(roleKey(r))}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="field-label">{t('name')}</span>
          <input className="field" value={c.name ?? ''} onChange={set('name')} autoFocus />
        </label>
        <label>
          <span className="field-label">{t('phone')}</span>
          <input className="field" type="tel" inputMode="tel" dir="ltr" value={c.phone ?? ''} onChange={set('phone')} />
        </label>
        <label>
          <span className="field-label">{t('email')}</span>
          <input className="field" type="email" dir="ltr" value={c.email ?? ''} onChange={set('email')} />
        </label>
        <label>
          <span className="field-label">{t('notes')}</span>
          <input className="field" value={c.notes ?? ''} onChange={set('notes')} />
        </label>
        <div className="mt-2 flex gap-2">
          <button type="submit" className="btn-dark flex-1" disabled={!valid || busy}>
            {busy ? t('saving') : t('save')}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {title === t('ownerPromptTitle') ? t('skip') : t('cancel')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
