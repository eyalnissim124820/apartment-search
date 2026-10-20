import path from 'node:path';
import { JsonStore } from './jsonStore.js';
import { SupabaseStore } from './supabaseStore.js';
import type { Store } from './Store.js';

export function createStore(): Store {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, DATA_FILE } = process.env;
  if (process.env.STORAGE === 'supabase') {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error('STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_KEY');
    }
    console.log('[store] using Supabase');
    return new SupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  const file = path.resolve(DATA_FILE ?? 'data/db.json');
  console.log(`[store] using JSON file ${file}`);
  return new JsonStore(file);
}

export type { Store };
