import { Dbs, Sys } from './db';
import { iso, WEBHOOK_URL } from './config';

export interface Row {
  due: number; orderId: string | null; tag: string; sys: Sys;
  sql: string; params: unknown[]; webhook?: unknown;
}

export const getClock = (d: Dbs) =>
  Date.parse((d.sim.prepare("SELECT value FROM sim_state WHERE key='clock'").get() as { value: string }).value);
export const setClock = (d: Dbs, ms: number) =>
  d.sim.prepare("INSERT INTO sim_state(key,value) VALUES('clock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(iso(ms));

/** Apply every pending script row due at or before `upTo`, in time order. */
export async function applyDue(d: Dbs, upTo: number, fireWebhooks: boolean) {
  const rows = d.sim
    .prepare('SELECT * FROM sim_script WHERE applied=0 AND due_at<=? ORDER BY due_at, id')
    .all(iso(upTo)) as any[];
  if (!rows.length) return { applied: 0, webhooks: 0 };

  const systems: Sys[] = ['erp', 'wms', 'tms'];
  systems.forEach((s) => d[s].exec('BEGIN'));
  d.sim.exec('BEGIN');
  try {
    const mark = d.sim.prepare('UPDATE sim_script SET applied=1 WHERE id=?');
    for (const r of rows) {
      d[r.sys as Sys].prepare(r.sql).run(...JSON.parse(r.params));
      mark.run(r.id);
    }
    systems.forEach((s) => d[s].exec('COMMIT'));
    d.sim.exec('COMMIT');
  } catch (e) {
    systems.forEach((s) => d[s].exec('ROLLBACK'));
    d.sim.exec('ROLLBACK');
    throw e;
  }

  let webhooks = 0;
  if (fireWebhooks && WEBHOOK_URL) {
    for (const r of rows.filter((x) => x.webhook)) {
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: r.webhook, signal: AbortSignal.timeout(2000),
        });
        webhooks++;
      } catch { /* DelIQ may be down; polling remains the fallback */ }
    }
  }
  return { applied: rows.length, webhooks };
}
