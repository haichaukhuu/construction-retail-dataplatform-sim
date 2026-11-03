-- ERP mock (system of record for customers, orders, commercial terms)
-- Apply: sqlite3 data/erp.db < erp.sql
-- Conventions: timestamps are ISO-8601 UTC text; money in EUR; IDs look like real ERP keys.
PRAGMA foreign_keys = ON;

CREATE TABLE distribution_centers (
  dc_id        TEXT PRIMARY KEY,              -- 'DC-SE-01'
  name         TEXT NOT NULL,
  city         TEXT NOT NULL
);

CREATE TABLE customers (
  customer_id     TEXT PRIMARY KEY,           -- 'C-000123'
  name            TEXT NOT NULL,
  customer_type   TEXT NOT NULL CHECK (customer_type IN ('B2B','B2C')),
  tier            TEXT NOT NULL DEFAULT 'STANDARD'
                  CHECK (tier IN ('STRATEGIC','KEY','STANDARD')),
  sla_hours       INTEGER,                    -- B2B: max tolerated delay; NULL for B2C
  late_penalty_eur REAL DEFAULT 0,            -- contractual penalty per late delivery
  email           TEXT,
  phone           TEXT,
  preferred_lang  TEXT NOT NULL DEFAULT 'sv',
  created_at      TEXT NOT NULL
);

CREATE TABLE sites (                          -- delivery locations (building sites / homes)
  site_id         TEXT PRIMARY KEY,           -- 'S-004521'
  customer_id     TEXT NOT NULL REFERENCES customers(customer_id),
  address         TEXT NOT NULL,
  postcode        TEXT NOT NULL,
  city            TEXT NOT NULL,
  latitude        REAL,
  longitude       REAL,
  access_notes    TEXT,                       -- 'gate code 4411, crane truck needed'
  site_contact    TEXT,
  site_phone      TEXT
);

CREATE TABLE products (
  sku             TEXT PRIMARY KEY,           -- 'SKU-PLY-18-2400'
  description     TEXT NOT NULL,
  category        TEXT NOT NULL,              -- timber, insulation, concrete, tools...
  is_bulky        INTEGER NOT NULL DEFAULT 0 CHECK (is_bulky IN (0,1)),
  unit_weight_kg  REAL,
  unit_price_eur  REAL NOT NULL
);

CREATE TABLE orders (
  order_id        TEXT PRIMARY KEY,           -- 'ORD-10432'
  customer_id     TEXT NOT NULL REFERENCES customers(customer_id),
  site_id         TEXT REFERENCES sites(site_id),
  dc_id           TEXT NOT NULL REFERENCES distribution_centers(dc_id),
  order_date      TEXT NOT NULL,
  promised_date   TEXT NOT NULL,              -- date promised to the customer
  window_start    TEXT,                       -- delivery window, B2B usually narrow
  window_end      TEXT,
  delivery_method TEXT NOT NULL DEFAULT 'DELIVERY' CHECK (delivery_method IN ('DELIVERY','PICKUP')),
  order_value_eur REAL NOT NULL,
  status          TEXT NOT NULL DEFAULT 'CONFIRMED'
                  CHECK (status IN ('OPEN','CONFIRMED','RELEASED','DISPATCHED','DELIVERED','CANCELLED')),
  updated_at      TEXT NOT NULL
);

CREATE TABLE order_lines (
  line_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT NOT NULL REFERENCES orders(order_id),
  line_no         INTEGER NOT NULL,
  sku             TEXT NOT NULL REFERENCES products(sku),
  qty_ordered     INTEGER NOT NULL,
  unit_price_eur  REAL NOT NULL,
  UNIQUE (order_id, line_no)
);

CREATE INDEX idx_orders_updated  ON orders(updated_at);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_promised ON orders(promised_date);
CREATE INDEX idx_lines_order     ON order_lines(order_id);
