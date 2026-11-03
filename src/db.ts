import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, SCHEMA_DIR } from './config';

export type Sys = 'erp' | 'wms' | 'tms';
export type Dbs = Record<Sys, Database.Database> & { sim: Database.Database };
export const NAMES = ['erp', 'wms', 'tms', 'sim'] as const;

export const dbFile = (n: string) => path.join(DATA_DIR, `${n}.db`);

export function resetData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const n of NAMES) for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile(n) + suffix, { force: true });
}

export function openAll(create = false): Dbs {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const out: any = {};
  for (const n of NAMES) {
    const db = new Database(dbFile(n));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    if (create) db.exec(fs.readFileSync(path.join(SCHEMA_DIR, `${n}.sql`), 'utf8'));
    out[n] = db;
  }
  return out as Dbs;
}
