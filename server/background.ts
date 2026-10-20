import { waitUntil } from '@vercel/functions';

/**
 * Run work after the HTTP response. On Vercel a function can be frozen once it
 * responds, so the promise is handed to `waitUntil`; locally it just runs.
 */
export function background<T>(work: Promise<T>, label = 'background'): Promise<T | undefined> {
  const safe = work.catch((err) => {
    console.warn(`[${label}]`, err instanceof Error ? err.message : err);
    return undefined;
  });
  if (process.env.VERCEL) waitUntil(safe);
  return safe;
}
