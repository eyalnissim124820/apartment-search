import type { Apartment } from '../../shared/types';

/**
 * Persistence boundary. Business rules live in the service layer, so a new
 * backend (Supabase, SQLite, …) only needs to implement these four methods.
 */
export interface Store {
  list(): Promise<Apartment[]>;
  get(id: string): Promise<Apartment | undefined>;
  save(apartment: Apartment): Promise<void>;
  remove(id: string): Promise<boolean>;
}
