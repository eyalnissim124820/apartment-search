import { useState } from 'react';
import { Languages, LogOut } from 'lucide-react';
import { useApp } from '../state';
import { Avatar, Sheet } from './ui';
import { userKey } from '../i18n/strings';
import { USERS } from '../../shared/types';

/** Greeting row with the user menu (switch user / language). */
export function TopBar() {
  const { t, user, setUser, toggleLang } = useApp();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <div className="flex items-center justify-between pt-safe">
        <button className="flex items-center gap-3 text-start" onClick={() => setOpen(true)}>
          <Avatar user={user} size={52} />
          <span>
            <span className="block text-lg font-medium leading-tight">{t('hi', { name: t(userKey(user)) })}</span>
            <span className="block text-sm text-ink/55">{t('welcomeBack')}</span>
          </span>
        </button>
        <button className="icon-btn" onClick={toggleLang} aria-label={t('language')}>
          <Languages size={20} />
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('switchUser')}>
        <div className="grid grid-cols-2 gap-3">
          {USERS.map((u) => (
            <button
              key={u}
              onClick={() => { setUser(u); setOpen(false); }}
              className={`rounded-3xl p-5 flex flex-col items-center gap-3 border-2 transition ${
                u === user ? 'border-ink bg-haze' : 'border-transparent bg-haze/60'
              }`}
            >
              <Avatar user={u} size={56} />
              <span className="font-semibold">{t(userKey(u))}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2">
          <button className="btn-light w-full" onClick={() => { toggleLang(); setOpen(false); }}>
            <Languages size={18} /> {t('language')}
          </button>
          <button className="btn-ghost w-full" onClick={() => setUser(null)}>
            <LogOut size={18} /> {t('switchUser')}
          </button>
        </div>
      </Sheet>
    </>
  );
}
