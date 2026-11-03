// Sanity checks: run after `npm run seed` (and optionally after a full `sim run`). Exit code 1 on failure.
import { openAll } from './db';
const d = openAll(false);
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) failed++; };
const one = (db: any, sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as any;
const all = (db: any, sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as any[];

check('every order has >=1 line', one(d.erp, 'SELECT COUNT(*) c FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id=o.order_id)').c === 0);
check('every order has a shipment', one(d.tms, 'SELECT COUNT(*) c FROM shipments').c === one(d.erp, 'SELECT COUNT(*) c FROM orders').c);
check('B2B share of orders ~65% (60-70%)', (() => {
  const r = one(d.erp, "SELECT 1.0*SUM(c.customer_type='B2B')/COUNT(*) p FROM orders o JOIN customers c USING(customer_id)").p;
  return r > 0.6 && r < 0.7;
})(), '');
const bad = all(d.tms, `SELECT shipment_id FROM milestones a JOIN milestones b USING(shipment_id)
  WHERE a.milestone_type='DEPARTED_DC' AND b.milestone_type='OUT_FOR_DELIVERY' AND a.actual_at IS NOT NULL AND b.actual_at IS NOT NULL AND a.actual_at > b.actual_at`);
check('departed before out-for-delivery', bad.length === 0, bad.length ? String(bad.length) : '');
const bad2 = all(d.tms, `SELECT shipment_id FROM milestones a JOIN milestones b USING(shipment_id)
  WHERE a.milestone_type='OUT_FOR_DELIVERY' AND b.milestone_type='DELIVERED' AND a.actual_at IS NOT NULL AND b.actual_at IS NOT NULL AND a.actual_at > b.actual_at`);
check('out-for-delivery before delivered', bad2.length === 0, bad2.length ? String(bad2.length) : '');
check('no delivered shipment without DELIVERED attempt', one(d.tms, "SELECT COUNT(*) c FROM shipments s WHERE status='DELIVERED' AND NOT EXISTS (SELECT 1 FROM delivery_attempts a WHERE a.shipment_id=s.shipment_id AND a.outcome='DELIVERED')").c === 0);
check('ERP DELIVERED == TMS DELIVERED', one(d.erp, "SELECT COUNT(*) c FROM orders WHERE status='DELIVERED'").c === one(d.tms, "SELECT COUNT(*) c FROM shipments WHERE status='DELIVERED'").c);

const planted = all(d.sim, 'SELECT exception_type t, COUNT(*) c FROM planted_exceptions GROUP BY t');
console.log('Planted:', planted.map((p) => `${p.t}=${p.c}`).join('  '));
const shorts = one(d.wms, "SELECT COUNT(*) c FROM wms_orders WHERE status='SHORT'").c;
const plantedShort = one(d.sim, "SELECT COUNT(*) c FROM planted_exceptions WHERE exception_type='SHORT_PICK'").c;
check('WMS SHORT orders == planted SHORT_PICK (after picking window)', shorts === plantedShort, `${shorts} vs ${plantedShort}`);
check('short-picks have a replenishment', one(d.wms, 'SELECT COUNT(*) c FROM replenishments').c >= plantedShort);
const hero = all(d.sim, 'SELECT order_id, exception_type FROM planted_exceptions WHERE is_hero=1 ORDER BY order_id');
check('4 hero orders present (3 with exceptions)', hero.length >= 3, hero.map((h) => `${h.order_id}:${h.exception_type}`).join(' '));
const h1 = one(d.erp, "SELECT o.order_value_eur v, c.tier FROM orders o JOIN customers c USING(customer_id) WHERE order_id='ORD-10001'");
check('hero 1 is STRATEGIC and >= 25k EUR', h1.tier === 'STRATEGIC' && h1.v >= 25000, `${h1.tier} ${h1.v}`);
check('no stock goes negative', one(d.wms, 'SELECT COUNT(*) c FROM stock WHERE on_hand<0').c === 0);
process.exit(failed ? 1 : 0);
