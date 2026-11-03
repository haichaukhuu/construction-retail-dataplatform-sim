import { fakerSV as faker } from '@faker-js/faker';
import { applyDue, Row, setClock } from './engine';
import { openAll, resetData, Dbs } from './db';
import { Rng } from './rng';
import {
  DC, H, M, iso, dayStart, SIM_DAY, SEED, T0, TODAY_ORDERS, HIST_DAYS, HIST_ORDERS_PER_DAY,
  EXCEPTION_RATE, STOPS_PER_ROUTE,
} from './config';
import { PRODUCTS, CITIES, CARRIERS, B2B_ACCESS, B2C_ACCESS } from './catalog';

type Exc = 'NONE' | 'SHORT_PICK' | 'LATE_DISPATCH' | 'TRANSIT_DELAY' | 'DELIVERY_FAILED' | 'BREAKDOWN';
interface Cust { id: string; type: 'B2B' | 'B2C'; tier: 'STRATEGIC' | 'KEY' | 'STANDARD'; sites: { id: string; city: string }[] }
interface Line { sku: string; qty: number; price: number; bulky: number }
interface Hero { type: 'B2B' | 'B2C'; tier: Cust['tier']; exc: Exc; delay?: number; win: [number, number]; minValue?: number; note: string }
interface Order {
  num: number; id: string; cust: Cust; site: { id: string; city: string }; orderDate: number;
  winStart: number; winEnd: number; lines: Line[]; value: number; carrier: (typeof CARRIERS)[number];
  exc: Exc; delay: number; hero?: Hero;
}

const HEROES: Hero[] = [
  { type: 'B2B', tier: 'STRATEGIC', exc: 'SHORT_PICK', win: [9, 11], minValue: 25000,
    note: 'HERO 1: STRATEGIC B2B, 25k+ EUR order, short-pick/stockout -> Path C (human-led)' },
  { type: 'B2B', tier: 'KEY', exc: 'TRANSIT_DELAY', delay: 120, win: [11, 13],
    note: 'HERO 2: KEY B2B delayed in transit, ETA updated -> Path B (approve reschedule/reroute)' },
  { type: 'B2C', tier: 'STANDARD', exc: 'DELIVERY_FAILED', win: [9, 16],
    note: 'HERO 3: B2C delivery failed (site closed) -> Path A (autonomous customer message)' },
  { type: 'B2B', tier: 'STANDARD', exc: 'NONE', win: [13, 15],
    note: 'HERO 4: clean order, use `npm run sim -- inject delay ORD-10004 150` to trigger live' },
];

export async function seed() {
  const rng = new Rng(SEED);
  faker.seed(SEED);
  resetData();
  const d: Dbs = openAll(true);
  const script: Row[] = [];
  const add = (due: number, orderId: string | null, tag: string, sys: Row['sys'], sql: string, params: unknown[], webhook?: unknown) =>
    script.push({ due, orderId, tag, sys, sql, params, webhook });

  // ───────── static master data ─────────
  d.erp.prepare('INSERT INTO distribution_centers VALUES (?,?,?)').run(DC.id, DC.name, DC.city);

  const insCust = d.erp.prepare('INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insSite = d.erp.prepare('INSERT INTO sites VALUES (?,?,?,?,?,?,?,?,?,?)');
  const customers: Cust[] = [];
  let siteNo = 4000;
  const t0Created = dayStart(SIM_DAY) - 400 * 24 * H;
  d.erp.exec('BEGIN');
  for (let i = 1; i <= 140; i++) {
    const type: Cust['type'] = i <= 60 ? 'B2B' : 'B2C';
    const tier: Cust['tier'] = type === 'B2C' ? 'STANDARD'
      : rng.weighted<Cust['tier']>([['STRATEGIC', 10], ['KEY', 30], ['STANDARD', 60]]);
    const sla = type === 'B2C' ? null : { STRATEGIC: 2, KEY: 4, STANDARD: 8 }[tier];
    const pen = type === 'B2C' ? 0 : { STRATEGIC: 500, KEY: 250, STANDARD: 100 }[tier];
    const name = type === 'B2B' ? `${faker.person.lastName()} Bygg & Entreprenad AB` : faker.person.fullName();
    const id = `C-${String(i).padStart(6, '0')}`;
    insCust.run(id, name, type, tier, sla, pen, faker.internet.email({ provider: 'example.se' }),
      faker.phone.number({ style: 'international' }), 'sv', iso(t0Created + i * H));
    const sites: Cust['sites'] = [];
    for (let s = 0; s < (type === 'B2B' ? rng.int(2, 4) : 1); s++) {
      const c = rng.pick(CITIES);
      const sid = `S-${String(++siteNo).padStart(6, '0')}`;
      insSite.run(sid, id, faker.location.streetAddress(), `${c.zip} ${String(rng.int(10, 99))}`, c.name,
        +(c.lat + rng.float() * 0.2 - 0.1).toFixed(5), +(c.lon + rng.float() * 0.3 - 0.15).toFixed(5),
        rng.pick(type === 'B2B' ? B2B_ACCESS : B2C_ACCESS), faker.person.fullName(), faker.phone.number({ style: 'international' }));
      sites.push({ id: sid, city: c.name });
    }
    customers.push({ id, type, tier, sites });
  }
  const insProd = d.erp.prepare('INSERT INTO products VALUES (?,?,?,?,?,?)');
  const insStock = d.wms.prepare('INSERT INTO stock VALUES (?,?,?,?,?,?,?)');
  for (const p of PRODUCTS) {
    insProd.run(p.sku, p.description, p.category, p.bulky, p.kg, p.price);
    insStock.run(DC.code, p.sku, p.bulky ? rng.int(300, 4000) : rng.int(500, 9000), rng.int(0, 150), rng.int(0, 12),
      iso(T0() - 2 * 24 * H), iso(T0() - 2 * 24 * H));
  }
  d.erp.exec('COMMIT');

  d.tms.exec('BEGIN');
  const insCar = d.tms.prepare('INSERT INTO carriers VALUES (?,?,?,?)');
  const insVeh = d.tms.prepare('INSERT INTO vehicles VALUES (?,?,?,?,?,?)');
  const vehicles: Record<string, string[]> = {};
  for (const c of CARRIERS) {
    insCar.run(c.id, c.name, c.integration, c.rating);
    vehicles[c.id] = [];
    for (let v = 1; v <= 6; v++) {
      const type = v <= 3 ? 'CRANE_TRUCK' : v <= 5 ? 'FLATBED' : 'VAN';
      const vid = `VH-${c.id.slice(-2)}-${String(v).padStart(2, '0')}`;
      const plate = `${faker.string.alpha({ length: 3, casing: 'upper' })} ${rng.int(100, 999)}`;
      insVeh.run(vid, c.id, plate, type, type === 'VAN' ? 1200 : type === 'FLATBED' ? 12000 : 9000, type === 'CRANE_TRUCK' ? 1 : 0);
      vehicles[c.id].push(vid);
    }
  }
  d.tms.exec('COMMIT');

  // ───────── order generation ─────────
  let nextNum = 10001 + HEROES.length;
  const b2b = customers.filter((c) => c.type === 'B2B');
  const b2c = customers.filter((c) => c.type === 'B2C');

  function makeOrder(deliveryDay: number, hero?: Hero): Order {
    const num = hero ? 10001 + HEROES.indexOf(hero) : nextNum++;
    const cust = hero
      ? rng.pick(customers.filter((c) => c.type === hero.type && c.tier === hero.tier))
      : rng.chance(0.65) ? rng.pick(b2b) : rng.pick(b2c);
    const site = rng.pick(cust.sites);
    const [ws, we] = hero ? hero.win
      : cust.type === 'B2B' ? rng.pick([[7, 9], [9, 11], [11, 13], [13, 15]]) : rng.pick([[7, 12], [12, 16], [7, 16]]);
    const prods = rng.shuffle(PRODUCTS);
    const mkLine = (p: (typeof PRODUCTS)[number], qty: number): Line => ({ sku: p.sku, qty, price: p.price, bulky: p.bulky });
    const lines: Line[] = [];
    const k = cust.type === 'B2B' ? rng.int(2, 6) : rng.int(1, 4);
    for (const p of prods.slice(0, k)) {
      lines.push(mkLine(p, cust.type === 'B2B' ? (p.bulky ? rng.int(10, 80) : rng.int(5, 40)) : rng.int(1, 6)));
    }
    if (hero?.minValue) {
      const bulky = prods.filter((p) => p.bulky && !lines.some((l) => l.sku === p.sku));
      while (lines.reduce((s, l) => s + l.qty * l.price, 0) < hero.minValue && bulky.length) lines.push(mkLine(bulky.shift()!, rng.int(60, 150)));
    }
    const value = +lines.reduce((s, l) => s + l.qty * l.price, 0).toFixed(2);
    const carrier = rng.weighted(CARRIERS.map((c) => [c, c.weight] as [(typeof CARRIERS)[number], number]));
    return {
      num, id: `ORD-${num}`, cust, site, orderDate: deliveryDay - 13 * H - rng.int(0, 70) * H,
      winStart: deliveryDay + ws * H, winEnd: deliveryDay + we * H, lines, value, carrier,
      exc: hero ? hero.exc : 'NONE', delay: hero?.delay ?? 0, hero,
    };
  }

  const insOrder = d.erp.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const insLine = d.erp.prepare('INSERT INTO order_lines (order_id,line_no,sku,qty_ordered,unit_price_eur) VALUES (?,?,?,?,?)');
  const insRoute = d.tms.prepare('INSERT INTO routes VALUES (?,?,?,?,?,?,?)');
  const insShip = d.tms.prepare('INSERT INTO shipments VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insMile = d.tms.prepare('INSERT INTO milestones (shipment_id,milestone_type,planned_at,actual_at) VALUES (?,?,?,NULL)');
  const insRepl = d.wms.prepare('INSERT INTO replenishments (dc_code,sku,qty,expected_at,status) VALUES (?,?,?,?,?)');
  const insPlant = d.sim.prepare('INSERT INTO planted_exceptions VALUES (?,?,?,?,?)');
  const pickerId = () => `P${rng.int(101, 140)}`;
  const summary: Record<string, number> = {};
  let routeSeq = 80;

  for (let off = -HIST_DAYS; off <= 0; off++) {
    const D = dayStart(SIM_DAY, off);
    const isToday = off === 0;
    const day = new Date(D).toISOString().slice(0, 10).replace(/-/g, '');
    const orders: Order[] = [];
    if (isToday) for (const h of HEROES) orders.push(makeOrder(D, h));
    const n = isToday ? TODAY_ORDERS : HIST_ORDERS_PER_DAY;
    while (orders.length < n) orders.push(makeOrder(D));
    for (const o of orders) {
      if (o.hero) continue;
      if (rng.chance(EXCEPTION_RATE)) {
        o.exc = rng.weighted<Exc>(isToday
          ? [['SHORT_PICK', 25], ['LATE_DISPATCH', 25], ['TRANSIT_DELAY', 30], ['DELIVERY_FAILED', 20]]
          : [['LATE_DISPATCH', 30], ['TRANSIT_DELAY', 40], ['DELIVERY_FAILED', 30]]);
        o.delay = o.exc === 'LATE_DISPATCH' ? rng.int(90, 180) : o.exc === 'TRANSIT_DELAY' ? rng.int(60, 240) : 0;
      }
    }

    d.erp.exec('BEGIN'); d.tms.exec('BEGIN'); d.wms.exec('BEGIN'); d.sim.exec('BEGIN');
    let routeNo = 0;
    for (const car of CARRIERS) {
      const mine = orders.filter((o) => o.carrier.id === car.id).sort((a, b) => a.winStart - b.winStart);
      for (let c = 0; c * STOPS_PER_ROUTE < mine.length; c++) {
        const chunk = mine.slice(c * STOPS_PER_ROUTE, (c + 1) * STOPS_PER_ROUTE);
        routeNo++; routeSeq++;
        const routeId = `RT-${day}-${String(routeNo).padStart(2, '0')}`;
        const depart = D + 5 * H + (routeNo % 4) * 10 * M;
        const veh = vehicles[car.id][(c + routeNo) % 6];
        const breakdownAt = isToday && car.id === 'CAR-01' && c === 1 ? depart + 3 * H : null;
        insRoute.run(routeId, DC.code, new Date(D).toISOString().slice(0, 10), veh, faker.person.fullName(), iso(depart), 'PLANNED');
        add(depart, null, 'route', 'tms', "UPDATE routes SET status='STARTED' WHERE route_id=?", [routeId]);
        let lastFinal = 0, blockedAny = false;

        chunk.forEach((o, idx) => {
          const seq = idx + 1;
          // ── master rows
          insOrder.run(o.id, o.cust.id, o.site.id, DC.id, iso(o.orderDate), new Date(o.winStart).toISOString().slice(0, 10),
            iso(o.winStart), iso(o.winEnd), 'DELIVERY', o.value, 'CONFIRMED', iso(o.orderDate));
          o.lines.forEach((l, i) => insLine.run(o.id, i + 1, l.sku, l.qty, l.price));
          const shipId = `SHP-${routeSeq}-${o.num}`;
          const tracking = `${car.prefix}${rng.int(1_000_000_000, 9_999_999_999)}`;
          const plannedEta = Math.round((o.winStart + o.winEnd) / 2);
          const release = D - 11 * H + rng.int(0, 30) * M;
          const baseOfd = Math.max(depart + 30 * M, o.winStart - 30 * M);
          const winLen = (o.winEnd - o.winStart) / M;
          const baseDel = Math.max(baseOfd + 20 * M, o.winStart + 10 * M + rng.int(0, Math.max(1, winLen - 20)) * M);
          insShip.run(shipId, `ORD${o.num}`, routeId, car.id, tracking, seq, iso(plannedEta), iso(plannedEta), 'PLANNED', iso(release));
          for (const [t, at] of [['PICKED_UP', depart - 15 * M], ['DEPARTED_DC', depart], ['OUT_FOR_DELIVERY', baseOfd], ['DELIVERED', plannedEta]] as [string, number][])
            insMile.run(shipId, t, iso(at));

          // ── exception resolution
          let exc = o.exc;
          if (breakdownAt && !o.hero && exc === 'NONE' && baseDel > breakdownAt) exc = 'BREAKDOWN';
          const dl = o.delay * M;
          let loaded = depart - 45 * M + seq * 3 * M, handed = loaded + 10 * M, dep = depart, ofd = baseOfd, del = baseDel;
          if (exc === 'LATE_DISPATCH') {
            loaded += dl; handed = loaded + 10 * M; dep = handed + 5 * M;
            ofd = Math.max(baseOfd, dep + 30 * M); del = Math.max(baseDel + dl, ofd + 20 * M);
          } else if (exc === 'TRANSIT_DELAY') {
            ofd = baseOfd + dl; del = baseDel + dl;
          }
          const held = exc === 'SHORT_PICK';
          const blockedOfd = exc === 'BREAKDOWN' && ofd > breakdownAt!;
          const loc = o.site.city;
          const E = (tag: string, ts: number, code: string, where: string, note: string | null) => {
            const payload = { carrierId: car.id, trackingId: tracking, event: code, ts: iso(ts), location: where, note };
            add(ts + M, o.id, tag, 'tms',
              'INSERT INTO carrier_events (carrier_id,tracking_id,event_code,event_ts,location,note,raw_json,received_at) VALUES (?,?,?,?,?,?,?,?)',
              [car.id, tracking, code, iso(ts), where, note, JSON.stringify({ trackingId: tracking, event: code, ts: iso(ts), loc: where, note }), iso(ts + M)],
              payload);
          };

          // ── ERP
          add(release, o.id, 'erp_released', 'erp', "UPDATE orders SET status='RELEASED', updated_at=? WHERE order_id=?", [iso(release), o.id]);
          // ── WMS
          const wmsNo = 500000 + o.num;
          const wmsNew = release + 5 * M;
          add(wmsNew, o.id, 'wms_new', 'wms', "INSERT INTO wms_orders VALUES (?,?,?,?,?,?,?,?)",
            [wmsNo, String(o.num), DC.code, `W${day}-${(routeNo % 3) + 1}`, 'NEW', iso(depart - 10 * M), iso(wmsNew), iso(wmsNew)]);
          for (const l of o.lines)
            add(wmsNew, o.id, 'wms_task', 'wms', "INSERT INTO pick_tasks (wms_order_no,sku,qty_required,qty_picked,status) VALUES (?,?,?,0,'OPEN')", [wmsNo, l.sku, l.qty]);
          const setWms = (tag: string, ts: number, status: string) =>
            add(ts, o.id, tag, 'wms', 'UPDATE wms_orders SET status=?, updated_at=? WHERE wms_order_no=?', [status, iso(ts), wmsNo]);
          setWms('wms_alloc', release + 15 * M, 'ALLOCATED');
          const picking = D - 10 * H + rng.int(0, 30) * M;
          setWms('wms_picking', picking, 'PICKING');
          const picked = D - 8 * H + rng.int(0, 40) * M;
          if (held) {
            const li = Math.max(0, o.lines.findIndex((l) => l.bulky));
            const sl = o.lines[li];
            const shortQty = Math.ceil(sl.qty * 0.6);
            const reason = rng.weighted([['STOCKOUT', 70], ['DAMAGED', 10], ['MISLOCATED', 10], ['COUNT_ERROR', 10]] as [string, number][]);
            add(picked, o.id, 'wms_picked', 'wms',
              "UPDATE pick_tasks SET qty_picked=qty_required, status='DONE', picker_id=?, picked_at=? WHERE wms_order_no=? AND sku<>?",
              [pickerId(), iso(picked), wmsNo, sl.sku]);
            add(picked, o.id, 'wms_picked', 'wms',
              "UPDATE pick_tasks SET qty_picked=?, status='SHORT', short_reason=?, picker_id=?, picked_at=? WHERE wms_order_no=? AND sku=?",
              [sl.qty - shortQty, reason, pickerId(), iso(picked), wmsNo, sl.sku]);
            if (reason === 'STOCKOUT')
              add(picked, o.id, 'wms_stock', 'wms', 'UPDATE stock SET on_hand=0, updated_at=? WHERE dc_code=? AND sku=?', [iso(picked), DC.code, sl.sku]);
            setWms('wms_picked', picked + 1, 'SHORT');
            insRepl.run(DC.code, sl.sku, shortQty * 2, iso(D + (rng.chance(0.6) ? 1 : 2) * 24 * H + 8 * H), rng.chance(0.2) ? 'DELAYED' : 'EXPECTED');
          } else {
            add(picked, o.id, 'wms_picked', 'wms',
              "UPDATE pick_tasks SET qty_picked=qty_required, status='DONE', picker_id=?, picked_at=? WHERE wms_order_no=?", [pickerId(), iso(picked), wmsNo]);
            setWms('wms_picked', picked + 1, 'PICKED');
            const staged = depart - 150 * M + rng.int(-10, 10) * M;
            const dock = `D${rng.int(1, 8)}`;
            setWms('wms_staged', staged, 'STAGED');
            add(staged, o.id, 'wms_disp', 'wms', 'INSERT INTO dispatch_events (wms_order_no,event_type,dock,trailer_no,event_ts) VALUES (?,?,?,?,?)', [wmsNo, 'STAGED', dock, null, iso(staged)]);
            setWms('wms_loaded', loaded, 'LOADED');
            add(loaded, o.id, 'wms_disp', 'wms', 'INSERT INTO dispatch_events (wms_order_no,event_type,dock,trailer_no,event_ts) VALUES (?,?,?,?,?)', [wmsNo, 'LOADED', dock, `TR-${routeNo}`, iso(loaded)]);
            add(handed, o.id, 'wms_disp', 'wms', 'INSERT INTO dispatch_events (wms_order_no,event_type,dock,trailer_no,event_ts) VALUES (?,?,?,?,?)', [wmsNo, 'HANDED_TO_CARRIER', dock, `TR-${routeNo}`, iso(handed)]);
            add(handed, o.id, 'erp_dispatched', 'erp', "UPDATE orders SET status='DISPATCHED', updated_at=? WHERE order_id=?", [iso(handed), o.id]);
          }
          // ── TMS + carrier
          add(release + 3 * H, o.id, 'tms_tender', 'tms', "UPDATE shipments SET status='TENDERED', updated_at=? WHERE shipment_id=?", [iso(release + 3 * H), shipId]);
          if (!held) {
            const ms = (tag: string, ts: number, type: string, status: string | null, eta: string | null | undefined) => {
              add(ts, o.id, tag, 'tms', 'UPDATE milestones SET actual_at=? WHERE shipment_id=? AND milestone_type=?', [iso(ts), shipId, type]);
              if (status) add(ts, o.id, tag, 'tms', 'UPDATE shipments SET status=?, current_eta=COALESCE(?, current_eta), updated_at=? WHERE shipment_id=?', [status, eta ?? null, iso(ts), shipId]);
            };
            add(handed, o.id, 'tms_pu', 'tms', 'UPDATE milestones SET actual_at=? WHERE shipment_id=? AND milestone_type=?', [iso(handed), shipId, 'PICKED_UP']);
            add(handed, o.id, 'tms_pu', 'tms', 'UPDATE shipments SET updated_at=? WHERE shipment_id=?', [iso(handed), shipId]);
            E('c_pu', handed, 'PU', DC.city, null);
            const etaAtDepart = exc === 'LATE_DISPATCH' && rng.chance(0.5) ? iso(plannedEta + dl) : iso(plannedEta);
            ms('tms_dep', dep, 'DEPARTED_DC', 'IN_TRANSIT', etaAtDepart);
            E('c_dep', dep, 'DEP', DC.city, null);

            if (exc === 'TRANSIT_DELAY') {
              const silent = !o.hero && rng.chance(0.4);
              const known = !silent && rng.chance(0.75);
              add(dep + 90 * M, o.id, 'tms_eta', 'tms',
                known ? 'UPDATE shipments SET current_eta=?, updated_at=? WHERE shipment_id=?' : 'UPDATE shipments SET current_eta=NULL, updated_at=? WHERE shipment_id=?',
                known ? [iso(plannedEta + dl), iso(dep + 90 * M), shipId] : [iso(dep + 90 * M), shipId]);
              if (!silent && (o.hero || rng.chance(0.5))) E('c_exc', dep + 60 * M, 'EXC', loc, 'Delay: traffic congestion');
              (o as any)._silent = silent;
            }
            if (!blockedOfd) {
              ms('tms_ofd', ofd, 'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', null);
              if (!(o as any)._silent) E('c_ofd', ofd, 'OFD', loc, null);
              if (exc === 'DELIVERY_FAILED') {
                const why = o.hero ? 'SITE_CLOSED' : rng.weighted([['SITE_CLOSED', 40], ['NO_ACCESS', 30], ['WRONG_ADDRESS', 10], ['DAMAGED', 10], ['REFUSED', 10]] as [string, number][]);
                add(del, o.id, 'tms_failed', 'tms', "UPDATE shipments SET status='FAILED', updated_at=? WHERE shipment_id=?", [iso(del), shipId]);
                add(del, o.id, 'tms_failed', 'tms', "INSERT INTO delivery_attempts (shipment_id,attempt_no,outcome,failure_reason,signed_by,attempted_at) VALUES (?,1,'FAILED',?,NULL,?)", [shipId, why, iso(del)]);
                E('c_exc', del, 'EXC', loc, `Attempt failed: ${why}`);
              } else if (exc !== 'BREAKDOWN' || del <= breakdownAt!) {
                ms('tms_delivered', del, 'DELIVERED', 'DELIVERED', iso(del));
                add(del, o.id, 'tms_delivered', 'tms', "INSERT INTO delivery_attempts (shipment_id,attempt_no,outcome,failure_reason,signed_by,attempted_at) VALUES (?,1,'DELIVERED',NULL,?,?)", [shipId, faker.person.fullName(), iso(del)]);
                add(del, o.id, 'erp_delivered', 'erp', "UPDATE orders SET status='DELIVERED', updated_at=? WHERE order_id=?", [iso(del), o.id]);
                E('c_del', del, 'DEL', loc, null);
              }
            }
            if (exc === 'BREAKDOWN') {
              blockedAny = true;
              E('c_exc', breakdownAt!, 'EXC', 'En route', 'Vehicle breakdown');
            }
            if (exc !== 'BREAKDOWN') lastFinal = Math.max(lastFinal, del);
          }

          if (exc !== 'NONE') {
            insPlant.run(o.id, exc, o.delay || null, o.hero ? 1 : 0, o.hero?.note ?? null);
            summary[exc + (isToday ? ' (today)' : ' (history)')] = (summary[exc + (isToday ? ' (today)' : ' (history)')] ?? 0) + 1;
          }
        });
        if (blockedAny) add(breakdownAt!, null, 'route', 'tms', "UPDATE routes SET status='BREAKDOWN' WHERE route_id=?", [routeId]);
        else if (lastFinal) add(lastFinal + 5 * M, null, 'route', 'tms', "UPDATE routes SET status='COMPLETED' WHERE route_id=?", [routeId]);
      }
    }
    d.erp.exec('COMMIT'); d.tms.exec('COMMIT'); d.wms.exec('COMMIT'); d.sim.exec('COMMIT');
  }

  // ───────── persist script, replay history up to T0 ─────────
  const insScript = d.sim.prepare('INSERT INTO sim_script (due_at,order_id,tag,sys,sql,params,webhook) VALUES (?,?,?,?,?,?,?)');
  d.sim.exec('BEGIN');
  script.sort((a, b) => a.due - b.due);
  for (const r of script) insScript.run(iso(r.due), r.orderId, r.tag, r.sys, r.sql, JSON.stringify(r.params), r.webhook ? JSON.stringify(r.webhook) : null);
  d.sim.exec('COMMIT');
  setClock(d, T0());
  const res = await applyDue(d, T0(), false);

  const pending = (d.sim.prepare('SELECT COUNT(*) c FROM sim_script WHERE applied=0').get() as { c: number }).c;
  console.log(`Seeded business day ${SIM_DAY} (seed ${SEED}). Clock = ${iso(T0())}`);
  console.log(`Script rows: ${script.length} (applied up to T0: ${res.applied}, pending: ${pending})`);
  console.log('Planted exceptions:', summary);
  Object.values(d).forEach((db) => db.close());
}

seed().catch((e) => { console.error(e); process.exit(1); });
