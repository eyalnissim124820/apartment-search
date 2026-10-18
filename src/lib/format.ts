import type { Lang } from '../i18n/strings';

const locale = (lang: Lang) => (lang === 'he' ? 'he-IL' : 'en-IL');

export const money = (n: number | undefined, lang: Lang) =>
  n == null ? '—' : `₪${n.toLocaleString(locale(lang))}`;

export const dateShort = (iso: string | undefined, lang: Lang) =>
  iso ? new Date(iso).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' }) : '';

export const dateTime = (iso: string | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(locale(lang), {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

export const time = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });

export function ago(iso: string, t: (k: 'justNow' | 'minutesAgo' | 'hoursAgo' | 'daysAgo', v?: Record<string, number>) => string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t('justNow');
  if (s < 3600) return t('minutesAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('hoursAgo', { n: Math.floor(s / 3600) });
  return t('daysAgo', { n: Math.floor(s / 86400) });
}

/** Normalize Israeli numbers for tel: / wa.me links. */
export function phoneLinks(phone: string) {
  const digits = phone.replace(/[^\d+]/g, '');
  const intl = digits.startsWith('+') ? digits.slice(1) : digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
  return { tel: `tel:${digits}`, wa: `https://wa.me/${intl}` };
}

/** Datetime-local input <-> ISO helpers. */
export const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : undefined);

/** Resize an image file to a compact JPEG data URL so it fits in the JSON store. */
export function compressImage(file: File, max = 1200, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
