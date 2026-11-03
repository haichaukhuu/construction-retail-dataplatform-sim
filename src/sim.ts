import { openAll, Dbs } from './db';
import { applyDue, getClock, setClock } from './engine';
import { DAY_END, M, iso, SIM_DAY, WEBHOOK_URL } from './config';

const [cmd = 'status', ...args] = process.argv.slice(2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const flag = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};

function status(d: Dbs) {
  const clock = getClock(d);
  const pending = (d.sim.prepare('SELECT COUNT(*) c FROM sim_script WHERE applied=0').get() as any).c;
  const next = d.sim.prepare('SELECT due_at FROM sim_script WHERE applied=0 ORDER BY due_at LIMIT 1').get() as any;
  const orders = d.erp.prepare('SELECT status, COUNT(*) c FROM orders GROUP BY status').all() as any[];
  console.log(`Sim clock : ${iso(clock)}  (business day ${SIM_DAY})`);
  console.log(`Pending   : ${pending} events, next at ${next?.due_at ?? '-'}`);
  console.log('ERP orders:', orders.map((o) => `${o.status}=${o.c}`).join('  '));
  console.log(`Webhook   : ${WEBHOOK_URL || '(not set, DelIQ polls the mock APIs)'}`);
}

async function tick(d: Dbs, to: number) {
  const r = await applyDue(d, to, true);
  setClock(d, to);
  return r;
}

async function inject(d: Dbs) {
  const [kind, order, extra] = args;
  if (!kind || !order) throw new Error('usage: inject delay <ORD-ID> <minutes> | inject fail <ORD-ID> [REASON]');
  const now = getClock(d);
  const shipment = d.tms.prepare("SELECT * FROM shipments WHERE order_ref=?").get(order.replace('-', '')) as any;
  if (!shipment) throw new Error(`No shipment for ${order}`);
  const pend = (tags: string[]) =>
    d.sim.prepare(`SELECT * FROM sim_script WHERE order_id=? AND applied=0 AND tag IN (${tags.map(() => '?').join(',')})`).all(order, ...tags) as any[];

  const emit = (due: number, tag: string, sql: string, params: unknown[], webhook?: unknown) =>
    d.sim.prepare('INSERT INTO sim_script (due_at,order_id,tag,sys,sql,params,webhook) VALUES (?,?,?,?,?,?,?)')
      .run(iso(due), order, tag, 'tms', sql, JSON.stringify(params), webhook ? JSON.stringify(webhook) : null);
  const carrierExc = (note: string) => {
    const p = { carrierId: shipment.carrier_id, trackingId: shipment.tracking_id, event: 'EXC', ts: iso(now), location: 'En route', note };
    emit(now + 1, 'c_exc', 'INSERT INTO carrier_events (carrier_id,tracking_id,event_code,event_ts,location,note,raw_json,received_at) VALUES (?,?,?,?,?,?,?,?)',
      [shipment.carrier_id, shipment.tracking_id, 'EXC', iso(now), 'En route', note,
        JSON.stringify({ trackingId: shipment.tracking_id, event: 'EXC', ts: iso(now), loc: 'En route', note }), iso(now + 1)], p);
  };

  if (kind === 'delay') {
    const minutes = Number(extra ?? 120);
    const rows = pend(['tms_ofd', 'tms_delivered', 'erp_delivered', 'c_ofd', 'c_del', 'tms_failed']);
    if (!rows.length) throw new Error('Nothing pending for that order (already delivered?).');
    const shift = d.sim.prepare('UPDATE sim_script SET due_at=? WHERE id=?');
    d.sim.exec('BEGIN');
    for (const r of rows) {
      const p = JSON.parse(r.params);
      const newDue = Date.parse(r.due_at) + minutes * M;
      shift.run(iso(newDue), r.id);
      // keep timestamp parameters coherent with the shifted due time
      p.forEach((v: unknown, i: number) => { if (typeof v === 'string' && v === r.due_at) p[i] = iso(newDue); });
      d.sim.prepare('UPDATE sim_script SET params=? WHERE id=?').run(JSON.stringify(p), r.id);
    }
    d.sim.exec('COMMIT');
    carrierExc(`Delay reported: ${minutes} min (traffic / road closure)`);
    d.tms.prepare('UPDATE shipments SET current_eta=NULL, updated_at=? WHERE shipment_id=?').run(iso(now), shipment.shipment_id);
    d.sim.prepare('INSERT OR REPLACE INTO planted_exceptions VALUES (?,?,?,1,?)').run(order, 'TRANSIT_DELAY', minutes, `INJECTED live at ${iso(now)}`);
    console.log(`Injected ${minutes} min delay on ${order}; ETA now unknown until DelIQ acts. Tick the clock to see events.`);
  } else if (kind === 'fail') {
    const reason = extra ?? 'SITE_CLOSED';
    const del = pend(['tms_delivered'])[0];
    if (!del) throw new Error('Delivery already happened or not scheduled.');
    const at = Date.parse(del.due_at);
    d.sim.prepare("DELETE FROM sim_script WHERE order_id=? AND applied=0 AND tag IN ('tms_delivered','erp_delivered','c_del')").run(order);
    emit(at, 'tms_failed', "UPDATE shipments SET status='FAILED', updated_at=? WHERE shipment_id=?", [iso(at), shipment.shipment_id]);
    emit(at, 'tms_failed', "INSERT INTO delivery_attempts (shipment_id,attempt_no,outcome,failure_reason,signed_by,attempted_at) VALUES (?,1,'FAILED',?,NULL,?)", [shipment.shipment_id, reason, iso(at)]);
    const p = { carrierId: shipment.carrier_id, trackingId: shipment.tracking_id, event: 'EXC', ts: iso(at), location: 'Delivery site', note: `Attempt failed: ${reason}` };
    emit(at + M, 'c_exc', 'INSERT INTO carrier_events (carrier_id,tracking_id,event_code,event_ts,location,note,raw_json,received_at) VALUES (?,?,?,?,?,?,?,?)',
      [shipment.carrier_id, shipment.tracking_id, 'EXC', iso(at), 'Delivery site', p.note, JSON.stringify({ trackingId: shipment.tracking_id, event: 'EXC', ts: iso(at), loc: 'Delivery site', note: p.note }), iso(at + M)], p);
    d.sim.prepare('INSERT OR REPLACE INTO planted_exceptions VALUES (?,?,?,1,?)').run(order, 'DELIVERY_FAILED', null, `INJECTED live: ${reason}`);
    console.log(`${order} will fail delivery (${reason}) at ${iso(at)}.`);
  } else throw new Error(`Unknown inject kind: ${kind}`);
  await tick(d, now); // flush immediate rows (carrier EXC), clock unchanged
}

(async () => {
  const d = openAll(false);
  try {
    if (cmd === 'status') status(d);
    else if (cmd === 'tick') {
      const to = flag('to') ? Date.parse(flag('to')!) : getClock(d) + Number(flag('minutes', '15')) * M;
      const r = await tick(d, to);
      console.log(`Clock -> ${iso(to)}; applied ${r.applied} events, ${r.webhooks} webhooks`);
    } else if (cmd === 'run') {
      const speed = Number(flag('speed', '120'));            // simulated seconds per real second
      const end = flag('until') ? Date.parse(`${SIM_DAY}T${flag('until')}:00Z`) : DAY_END();
      let clock = getClock(d);
      console.log(`Running ${speed}x from ${iso(clock)} to ${iso(end)} (Ctrl+C to pause)`);
      while (clock < end) {
        clock = Math.min(end, clock + speed * 1000);
        const r = await tick(d, clock);
        if (r.applied) console.log(`[${iso(clock)}] +${r.applied} events${r.webhooks ? `, ${r.webhooks} webhooks` : ''}`);
        await sleep(1000);
      }
      console.log('Day complete.');
    } else if (cmd === 'inject') await inject(d);
    else console.log('commands: status | tick [--minutes N | --to ISO] | run [--speed 120 --until HH:MM] | inject delay|fail <ORD-ID> ...');
  } finally { Object.values(d).forEach((x) => x.close()); }
})().catch((e) => { console.error(e.message); process.exit(1); });
