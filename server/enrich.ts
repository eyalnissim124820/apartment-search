import { USERS, type Apartment, type Commute, type UserId } from '../shared/types.js';
import { geoQuery } from '../shared/workflow.js';
import { driveTime, geocode } from './geo.js';
import type { Store } from './store/Store.js';
import { background } from './background.js';

/**
 * Background location work: geocode apartments and workplaces, then compute
 * commute times. Runs after the HTTP response so slow free APIs never block the UI.
 */
export class Enricher {
  private pending = new Set<string>();

  constructor(private readonly store: Store) {}

  /** Re-geocode if the address changed, then refresh commutes. */
  schedule(apt: Apartment) {
    if (this.pending.has(apt.id)) return;
    this.pending.add(apt.id);
    background(this.enrich(apt.id).finally(() => this.pending.delete(apt.id)), `geo ${apt.id}`);
  }

  private async commutes(geo: { lat: number; lng: number }) {
    const { settings } = await this.store.getMeta();
    const out: Partial<Record<UserId, Commute>> = {};
    for (const u of USERS) {
      const w = settings.work[u];
      if (w?.lat != null && w.lng != null) out[u] = await driveTime(geo, { lat: w.lat, lng: w.lng });
    }
    return out;
  }

  async enrich(id: string, force = false) {
    const apt = await this.store.get(id);
    if (!apt) return;
    const query = geoQuery(apt);
    let geo = apt.geo;
    if (!query) geo = undefined;
    else if (force || !geo || geo.query !== query) {
      // Fall back to a coarser query (neighborhood + city, then city) when the street isn't found.
      const tries = [query, [apt.neighborhood, apt.city].filter(Boolean).join(', '), apt.city ?? ''];
      geo = undefined;
      for (const q of [...new Set(tries)].filter(Boolean)) {
        const p = await geocode(q);
        if (p) { geo = { ...p, query }; break; }
      }
    }
    const commute = geo ? await this.commutes(geo) : undefined;

    // Re-read right before writing so we only touch location fields.
    const fresh = await this.store.get(id);
    if (!fresh) return;
    fresh.geo = geo;
    fresh.commute = commute;
    await this.store.save(fresh);
  }

  /** Geocode a workplace address. */
  locate(address: string) {
    return geocode(address);
  }

  /** After workplaces change, recompute every apartment's commute (and fill in missing geocodes). */
  async refreshAll(force = false) {
    for (const apt of await this.store.list()) {
      try {
        await this.enrich(apt.id, force);
      } catch (err) {
        console.warn('[geo]', apt.id, (err as Error).message);
      }
    }
  }
}
