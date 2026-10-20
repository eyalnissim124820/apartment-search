import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Apartment } from '../../shared/types.js';
import { emptyMeta, type Meta, type Store } from './Store.js';

/**
 * Supabase backend. Each apartment is a row holding the full document in a
 * jsonb column — same shape as the JSON file, so migrating is a straight copy.
 * See supabase/schema.sql.
 */
export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(
    url: string,
    serviceKey: string,
    private readonly table = 'apartments',
    private readonly metaTable = 'app_meta',
  ) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async list() {
    const { data, error } = await this.db
      .from(this.table)
      .select('data')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => r.data as Apartment);
  }

  async get(id: string) {
    const { data, error } = await this.db.from(this.table).select('data').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data?.data as Apartment | undefined) ?? undefined;
  }

  async save(apartment: Apartment) {
    const { error } = await this.db.from(this.table).upsert({
      id: apartment.id,
      data: apartment,
      status: apartment.status,
      created_at: apartment.createdAt,
      updated_at: apartment.updatedAt,
    });
    if (error) throw error;
  }

  async remove(id: string) {
    const { error, count } = await this.db.from(this.table).delete({ count: 'exact' }).eq('id', id);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async getMeta() {
    const { data, error } = await this.db.from(this.metaTable).select('data').eq('id', 'main').maybeSingle();
    if (error) throw error;
    return { ...emptyMeta(), ...(data?.data as Meta | undefined) };
  }

  async saveMeta(meta: Meta) {
    const { error } = await this.db.from(this.metaTable).upsert({ id: 'main', data: meta });
    if (error) throw error;
  }
}
