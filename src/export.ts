import fs from 'node:fs';
import path from 'node:path';
import { openAll } from './db';
import { EXPORT_DIR } from './config';

const esc = (v: unknown) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const d = openAll(false);
for (const sys of ['erp', 'wms', 'tms'] as const) {
  const dir = path.join(EXPORT_DIR, sys);
  fs.mkdirSync(dir, { recursive: true });
  const tables = d[sys].prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  for (const { name } of tables) {
    const rows = d[sys].prepare(`SELECT * FROM ${name}`).all() as Record<string, unknown>[];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    fs.writeFileSync(path.join(dir, `${name}.csv`), [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
    console.log(`${sys}/${name}.csv  (${rows.length} rows)`);
  }
}
