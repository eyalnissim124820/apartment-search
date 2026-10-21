import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Bell, BellOff, Briefcase, Plus, Radar, RefreshCw, Send, Wallet, X } from 'lucide-react';
import { USERS, type BudgetBasis, type SavedSearch, type UserId } from '../../shared/types';
import { useApp } from '../state';
import { api } from '../lib/api';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { Avatar } from '../components/ui';
import { userKey } from '../i18n/strings';
import { dateTime } from '../lib/format';

export default function Settings() {
  const { t, lang, settings, setSettings, showToast, refresh } = useApp();
  const nav = useNavigate();
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;
  const [max, setMax] = useState('');
  const [basis, setBasis] = useState<BudgetBasis>('rent');
  const [work, setWork] = useState<Record<UserId, string>>({ eyal: '', ofir: '' });
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;

  useEffect(() => {
    if (!settings) return;
    setMax(settings.budget?.max ? String(settings.budget.max) : '');
    setBasis(settings.budget?.basis ?? 'rent');
    setWork({ eyal: settings.work.eyal?.address ?? '', ofir: settings.work.ofir?.address ?? '' });
  }, [settings]);

  useEffect(() => { pushState().then(setPush); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const out = await api.saveSettings({
        budget: { max: max ? Number(max) : undefined, basis },
        work: { eyal: { address: work.eyal }, ofir: { address: work.ofir } },
      });
      setSettings(out);
      showToast(t('saved'));
      // Commutes are recomputed in the background; pick them up shortly.
      setTimeout(refresh, 4000);
    } catch (e) {
      showToast(`${t('error')}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const togglePush = async () => {
    try {
      setPush(push === 'on' ? await disablePush() : await enablePush(settings!.vapidPublicKey, lang));
    } catch (e) {
      showToast(`${t('error')}: ${(e as Error).message}`);
    }
  };

  return (
    <main className="pt-safe pb-28">
      <div className="flex items-center pt-2">
        <button className="icon-btn" onClick={() => nav(-1)} aria-label="back"><Back size={20} /></button>
      </div>
      <h1 className="mt-6 text-4xl font-bold tracking-tight">{t('settings')}</h1>

      <section className="card mt-6 p-5 grid gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Wallet size={20} /> {t('budget')}</h2>
        <label>
          <span className="field-label">{t('budgetMax')}</span>
          <input className="field" type="number" inputMode="numeric" placeholder="₪" value={max} onChange={(e) => setMax(e.target.value)} />
        </label>
        <div>
          <span className="field-label">{t('budgetBasis')}</span>
          <div className="flex gap-2">
            {(['rent', 'total'] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBasis(b)}
                className={`chip !shadow-none flex-1 justify-center ${basis === b ? 'chip-active' : '!bg-haze'}`}
              >
                {t(b === 'rent' ? 'basisRent' : 'basisTotal')}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card mt-4 p-5 grid gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Briefcase size={20} /> {t('commute')}</h2>
        {USERS.map((u) => (
          <label key={u}>
            <span className="field-label flex items-center gap-2">
              <Avatar user={u} size={22} /> {t('workAddress', { name: t(userKey(u)) })}
            </span>
            <input
              className="field"
              placeholder={t('workAddressHint')}
              value={work[u]}
              onChange={(e) => setWork((w) => ({ ...w, [u]: e.target.value }))}
              dir="auto"
            />
            {settings?.work[u]?.address && settings.work[u]?.lat == null && (
              <p className="mt-1 ps-1 text-xs text-[#B42318]">{t('noLocation')}</p>
            )}
          </label>
        ))}
      </section>

      <button className="btn-dark mt-4 w-full !h-14 text-lg" onClick={save} disabled={busy || !settings}>
        {busy ? t('saving') : t('save')}
      </button>

      <Yad2ScanSection />

      <section className="card mt-8 p-5 grid gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell size={20} /> {t('notifications')}</h2>
        <p className="text-sm text-ink/60">{t('notificationsSub')}</p>
        {isIos && !standalone && <p className="rounded-2xl bg-accent-soft p-3 text-sm text-[#1F3BCC]">{t('iosHint')}</p>}
        {push === 'unsupported' && <p className="text-sm text-ink/50">{t('notificationsUnsupported')}</p>}
        {push === 'denied' && <p className="text-sm text-[#B42318]">{t('notificationsDenied')}</p>}
        {push === 'on' && <p className="text-sm font-medium text-[#0F7A55]">✓ {t('notificationsOn')}</p>}
        {(push === 'on' || push === 'off') && (
          <button className={push === 'on' ? 'btn-light' : 'btn-accent'} onClick={togglePush} disabled={!settings}>
            {push === 'on' ? <BellOff size={18} /> : <Bell size={18} />}
            {t(push === 'on' ? 'disableNotifications' : 'enableNotifications')}
          </button>
        )}
        {push === 'on' && (
          <button className="btn-ghost" onClick={() => api.pushTest().catch((e) => showToast((e as Error).message))}>
            <Send size={16} className="rtl:-scale-x-100" /> {t('testNotification')}
          </button>
        )}
      </section>
    </main>
  );
}

const YAD2_SEARCH = /^https:\/\/(www\.)?yad2\.co\.il\/realestate\//i;

/** Saved Yad2 searches that the server scans through Apify. Saves immediately on add/remove. */
function Yad2ScanSection() {
  const { t, lang, settings, setSettings, showToast, refresh } = useApp();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const searches = settings?.yad2Searches ?? [];
  const scan = settings?.scan;

  const saveSearches = async (next: SavedSearch[]) => {
    setBusy(true);
    try {
      setSettings(await api.saveSettings({ yad2Searches: next }));
    } catch (e) {
      showToast(`${t('error')}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    if (!YAD2_SEARCH.test(url.trim())) return showToast(t('invalidYad2Url'));
    saveSearches([...searches, { url: url.trim(), label: label.trim() || undefined }]);
    setUrl('');
    setLabel('');
  };

  const runNow = async () => {
    if (!confirm(t('scanConfirm'))) return;
    setBusy(true);
    try {
      await api.yad2Scan();
      showToast(t('scanStarted'));
      await refresh();
    } catch (e) {
      showToast(`${t('error')}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card mt-4 p-5 grid gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Radar size={20} /> {t('yad2Scan')}</h2>
      <p className="text-sm text-ink/60">{t('yad2ScanSub')}</p>
      {settings && !settings.scanConfigured && (
        <p className="rounded-2xl bg-[#FFF3DF] p-3 text-sm text-[#7A4808]">{t('scanNotConfigured')}</p>
      )}

      {searches.map((s, i) => (
        <div key={s.url} className="flex items-center gap-2 rounded-2xl bg-haze p-3">
          <div className="min-w-0 flex-1">
            {s.label && <div className="font-medium">{s.label}</div>}
            <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-ink/50" dir="ltr">{s.url}</a>
          </div>
          <button className="p-1 text-ink/40" disabled={busy} onClick={() => saveSearches(searches.filter((_, j) => j !== i))} aria-label="remove">
            <X size={18} />
          </button>
        </div>
      ))}

      {searches.length < 5 && (
        <div className="grid gap-2">
          <input className="field" type="url" dir="ltr" placeholder={t('yad2SearchPlaceholder')} value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="flex gap-2">
            <input className="field" placeholder={t('yad2SearchLabel')} value={label} onChange={(e) => setLabel(e.target.value)} dir="auto" />
            <button className="btn-light !shadow-none bg-haze shrink-0" disabled={busy || !url.trim()} onClick={add}>
              <Plus size={18} /> {t('addSearch')}
            </button>
          </div>
        </div>
      )}

      {scan && (
        <p className={`text-sm ${scan.status === 'failed' ? 'text-[#B42318]' : 'text-ink/60'}`}>
          {scan.status === 'running'
            ? t('scanRunning', { time: dateTime(scan.startedAt, lang) })
            : scan.status === 'failed'
              ? t('scanFailed', { error: scan.error ?? '' })
              : t('scanLast', { time: dateTime(scan.finishedAt, lang), found: scan.found ?? 0, added: scan.added ?? 0 })}
        </p>
      )}

      <button className="btn-dark" disabled={busy || !searches.length || !settings?.scanConfigured || scan?.status === 'running'} onClick={runNow}>
        <RefreshCw size={18} className={scan?.status === 'running' ? 'animate-spin' : ''} /> {t('runScanNow')}
      </button>
    </section>
  );
}
