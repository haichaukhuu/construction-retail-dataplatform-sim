// Read-only access to the simulated source systems. Copy into your Next.js app (e.g. src/lib/sources.ts).
// Needs: npm i better-sqlite3 && npm i -D @types/better-sqlite3
// Set SIM_DATA_DIR in .env.local to the absolute path of deliq-sim/data.
import Database from 'better-sqlite3';
import path from 'node:path';

export type System = 'erp' | 'wms' | 'tms';
export const TABLES: Record<System, string[]> = {
  erp: ['distribution_centers', 'customers', 'sites', 'products', 'orders', 'order_lines'],
  wms: ['wms_orders', 'stock', 'pick_tasks', 'dispatch_events', 'replenishments'],
  tms: ['carriers', 'vehicles', 'routes', 'shipments', 'milestones', 'delivery_attempts', 'carrier_events'],
};
/** Column used for incremental polling (?updated_since=...). */
const CURSOR_COL: Record<string, string> = {
  carrier_events: 'received_at', delivery_attempts: 'attempted_at', dispatch_events: 'event_ts',
};

const DIR = () => process.env.SIM_DATA_DIR ?? path.resolve(process.cwd(), '..', 'deliq-sim', 'data');
const cache = new Map<string, Database.Database>();

export function openDb(name: System | 'sim'): Database.Database {
  let db = cache.get(name);
  if (!db) {
    db = new Database(path.join(DIR(), `${name}.db`), { fileMustExist: true });
    db.pragma('query_only = ON');           // the integration layer is read-only by design
    cache.set(name, db);
  }
  return db;
}

/** Simulated "now". DelIQ must use this instead of Date.now() so detection rules follow the replay. */
export function simNow(): string {
  return (openDb('sim').prepare("SELECT value FROM sim_state WHERE key='clock'").get() as { value: string }).value;
}

export function queryTable(system: System, table: string, q: URLSearchParams) {
  if (!TABLES[system]?.includes(table)) throw new Error('unknown table');
  const db = openDb(system);
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  const where: string[] = []; const params: unknown[] = [];

  const since = q.get('updated_since');
  const cursor = cols.includes('updated_at') ? 'updated_at' : CURSOR_COL[table];
  if (since && cursor) { where.push(`${cursor} > ?`); params.push(since); }

  for (const [k, v] of q.entries()) {                 // generic equality filters, e.g. ?shipment_id=SHP-81-10004
    if (['updated_since', 'limit', 'offset'].includes(k)) continue;
    if (!cols.includes(k)) throw new Error(`unknown column ${k}`);
    where.push(`${k} = ?`); params.push(v);
  }
  const limit = Math.min(Number(q.get('limit') ?? 1000), 5000);
  const offset = Number(q.get('offset') ?? 0);
  const order = cursor ? `ORDER BY ${cursor}, rowid` : 'ORDER BY rowid';
  const sql = `SELECT * FROM ${table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ${order} LIMIT ? OFFSET ?`;
  const data = db.prepare(sql).all(...params, limit, offset);
  return { data, count: data.length, fetchedAt: simNow() };
}
