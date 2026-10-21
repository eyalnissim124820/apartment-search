import type { Apartment, ScanStatus, Settings, UserId } from '../../shared/types.js';

export interface PushSubscriptionRecord {
  user: UserId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Language to write notifications in for this device. */
  lang?: 'he' | 'en';
  createdAt: string;
}

/** App-wide state that isn't an apartment. Holds secrets – never send as-is to clients. */
export interface Meta {
  settings: Settings;
  vapid?: { publicKey: string; privateKey: string };
  subscriptions: PushSubscriptionRecord[];
  /** Latest automatic Yad2 scan. */
  scan?: ScanStatus;
}

export const emptyMeta = (): Meta => ({ settings: { work: {} }, subscriptions: [] });

/**
 * Persistence boundary. Business rules live in the service layer, so a new
 * backend (Supabase, SQLite, …) only needs to implement these methods.
 */
export interface Store {
  list(): Promise<Apartment[]>;
  get(id: string): Promise<Apartment | undefined>;
  save(apartment: Apartment): Promise<void>;
  remove(id: string): Promise<boolean>;
  getMeta(): Promise<Meta>;
  saveMeta(meta: Meta): Promise<void>;
}
