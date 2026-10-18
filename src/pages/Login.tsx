import { Languages } from 'lucide-react';
import { USERS } from '../../shared/types';
import { useApp } from '../state';
import { Avatar } from '../components/ui';
import { userKey } from '../i18n/strings';

export default function Login() {
  const { t, setUser, toggleLang } = useApp();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="flex justify-end pt-2">
        <button className="chip" onClick={toggleLang}>
          <Languages size={16} /> {t('language')}
        </button>
      </div>
      <div className="mt-10 sm:mt-16">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink">
          <img src="/icon.svg" alt="" className="h-14 w-14" />
        </div>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">{t('appName')}</h1>
        <p className="mt-6 text-2xl font-semibold">{t('whoAreYou')}</p>
        <p className="mt-1 text-ink/55">{t('whoAreYouSub')}</p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4">
        {USERS.map((u, i) => (
          <button
            key={u}
            onClick={() => setUser(u)}
            className="card flex flex-col items-center gap-4 py-8 animate-rise active:scale-95 transition hover:shadow-float"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <Avatar user={u} size={88} />
            <span className="text-xl font-semibold">{t(userKey(u))}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
