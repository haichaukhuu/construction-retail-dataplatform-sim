-- WMS mock (warehouse execution: allocation, picking, staging, loading)
-- Apply: sqlite3 data/wms.db < wms.sql
-- Deliberately different from ERP: numeric order refs, its own status vocabulary, dc_code not dc_id.
PRAGMA foreign_keys = ON;

CREATE TABLE wms_orders (
  wms_order_no   INTEGER PRIMARY KEY,         -- internal WMS number
  ext_ref        TEXT NOT NULL UNIQUE,        -- '10432' = ERP 'ORD-10432' without prefix
  dc_code        TEXT NOT NULL,               -- 'SE01'
  wave_id        TEXT,                        -- picking wave
  status         TEXT NOT NULL
                 CHECK (status IN ('NEW','ALLOCATED','PICKING','PICKED','SHORT','STAGED','LOADED')),
  cutoff_at      TEXT,                        -- latest load time to make the route
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE stock (
  dc_code        TEXT NOT NULL,
  sku            TEXT NOT NULL,
  on_hand        INTEGER NOT NULL DEFAULT 0,
  allocated      INTEGER NOT NULL DEFAULT 0,
  damaged        INTEGER NOT NULL DEFAULT 0,
  last_counted_at TEXT,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (dc_code, sku)
);

CREATE TABLE pick_tasks (
  task_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  wms_order_no   INTEGER NOT NULL REFERENCES wms_orders(wms_order_no),
  sku            TEXT NOT NULL,
  qty_required   INTEGER NOT NULL,
  qty_picked     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE','SHORT')),
  short_reason   TEXT CHECK (short_reason IN ('STOCKOUT','DAMAGED','MISLOCATED','COUNT_ERROR') OR short_reason IS NULL),
  picker_id      TEXT,
  picked_at      TEXT
);

CREATE TABLE dispatch_events (
  event_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  wms_order_no   INTEGER NOT NULL REFERENCES wms_orders(wms_order_no),
  event_type     TEXT NOT NULL CHECK (event_type IN ('STAGED','LOADED','HANDED_TO_CARRIER')),
  dock           TEXT,
  trailer_no     TEXT,
  event_ts       TEXT NOT NULL
);

CREATE TABLE replenishments (                 -- inbound supply; lets AI suggest backorder ETAs
  replen_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  dc_code        TEXT NOT NULL,
  sku            TEXT NOT NULL,
  qty            INTEGER NOT NULL,
  expected_at    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'EXPECTED' CHECK (status IN ('EXPECTED','RECEIVED','DELAYED'))
);

CREATE INDEX idx_wms_orders_updated ON wms_orders(updated_at);
CREATE INDEX idx_wms_orders_status  ON wms_orders(status);
CREATE INDEX idx_pick_order         ON pick_tasks(wms_order_no);
CREATE INDEX idx_dispatch_order     ON dispatch_events(wms_order_no);
