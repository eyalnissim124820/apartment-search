import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Apartment } from '../../shared/types';
import { emptyMeta, type Meta, type Store } from './Store';

interface DbFile {
  version: 1;
  apartments: Apartment[];
  meta?: Meta;
}

/** Single JSON file on disk. Writes are serialized and atomic (tmp + rename). */
export class JsonStore implements Store {
  private cache: DbFile | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<DbFile> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(this.file, 'utf8')) as DbFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      this.cache = { version: 1, apartments: [] };
    }
    return this.cache;
  }

  private async flush(db: DbFile): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async list() {
    return (await this.load()).apartments;
  }

  async get(id: string) {
    return (await this.load()).apartments.find((a) => a.id === id);
  }

  save(apartment: Apartment) {
    return this.exclusive(async () => {
      const db = await this.load();
      const i = db.apartments.findIndex((a) => a.id === apartment.id);
      if (i >= 0) db.apartments[i] = apartment;
      else db.apartments.unshift(apartment);
      await this.flush(db);
    });
  }

  async getMeta() {
    const db = await this.load();
    return { ...emptyMeta(), ...db.meta };
  }

  saveMeta(meta: Meta) {
    return this.exclusive(async () => {
      const db = await this.load();
      db.meta = meta;
      await this.flush(db);
    });
  }

  remove(id: string) {
    return this.exclusive(async () => {
      const db = await this.load();
      const before = db.apartments.length;
      db.apartments = db.apartments.filter((a) => a.id !== id);
      if (db.apartments.length === before) return false;
      await this.flush(db);
      return true;
    });
  }
}
