import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Apartment, UserId } from '../shared/types';
import { USERS } from '../shared/types';
import { api, setApiUser } from './lib/api';
import { strings, type Lang, type StringKey } from './i18n/strings';

const read = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string | null) => {
  try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ }
};

interface AppState {
  user: UserId | null;
  setUser: (u: UserId | null) => void;
  lang: Lang;
  toggleLang: () => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  apartments: Apartment[];
  loaded: boolean;
  offline: boolean;
  refresh: () => Promise<void>;
  /** Run a mutation and merge the returned apartment into local state. */
  mutate: (fn: () => Promise<Apartment | void>, removeId?: string) => Promise<Apartment | void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

const Ctx = createContext<AppState | null>(null);
const POLL_MS = 15_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserId | null>(() => {
    const u = read('user') as UserId | null;
    return u && USERS.includes(u) ? u : null;
  });
  const [lang, setLang] = useState<Lang>(() => (read('lang') === 'en' ? 'en' : 'he'));
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();

  setApiUser(user);

  const setUser = useCallback((u: UserId | null) => {
    setUserState(u);
    write('user', u);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((l) => {
      const next = l === 'he' ? 'en' : 'he';
      write('lang', next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.title = strings[lang].appName;
  }, [lang]);

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      let s = strings[lang][key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const refresh = useCallback(async () => {
    try {
      setApartments(await api.list());
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Keep both partners in sync: poll, and refetch when the tab regains focus.
  useEffect(() => {
    if (!user) return;
    refresh();
    const id = window.setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refresh]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const mutate = useCallback(
    async (fn: () => Promise<Apartment | void>, removeId?: string) => {
      try {
        const out = await fn();
        if (removeId) setApartments((list) => list.filter((a) => a.id !== removeId));
        if (out) {
          setApartments((list) => {
            const i = list.findIndex((a) => a.id === out.id);
            if (i < 0) return [out, ...list];
            const copy = list.slice();
            copy[i] = out;
            return copy;
          });
        }
        return out;
      } catch (e) {
        showToast(`${strings[lang].error}: ${(e as Error).message}`);
        throw e;
      }
    },
    [lang, showToast],
  );

  const value = useMemo<AppState>(
    () => ({ user, setUser, lang, toggleLang, t, apartments, loaded, offline, refresh, mutate, toast, showToast }),
    [user, setUser, lang, toggleLang, t, apartments, loaded, offline, refresh, mutate, toast, showToast],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
