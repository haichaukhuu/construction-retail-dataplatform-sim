-- TMS mock (transport planning/tracking) + carrier event feed
-- Apply: sqlite3 data/tms.db < tms.sql
-- order_ref is 'ORD10432' (no hyphen) on purpose: DelIQ's adapter must normalise IDs.
PRAGMA foreign_keys = ON;

CREATE TABLE carriers (
  carrier_id     TEXT PRIMARY KEY,            -- 'CAR-01'
  name           TEXT NOT NULL,
  integration    TEXT NOT NULL CHECK (integration IN ('API','WEBHOOK','CSV')),
  on_time_rating REAL                         -- historical 0..1, input for triage ranking
);

CREATE TABLE vehicles (
  vehicle_id     TEXT PRIMARY KEY,
  carrier_id     TEXT NOT NULL REFERENCES carriers(carrier_id),
  plate          TEXT NOT NULL,
  vehicle_type   TEXT NOT NULL,               -- 'CRANE_TRUCK','VAN','FLATBED'
  capacity_kg    INTEGER NOT NULL,
  has_crane      INTEGER NOT NULL DEFAULT 0 CHECK (has_crane IN (0,1))
);

CREATE TABLE routes (
  route_id       TEXT PRIMARY KEY,            -- 'RT-20261109-03'
  dc_code        TEXT NOT NULL,
  route_date     TEXT NOT NULL,
  vehicle_id     TEXT REFERENCES vehicles(vehicle_id),
  driver_name    TEXT,
  planned_start  TEXT,
  status         TEXT NOT NULL DEFAULT 'PLANNED'
                 CHECK (status IN ('PLANNED','STARTED','COMPLETED','CANCELLED','BREAKDOWN'))
);

CREATE TABLE shipments (
  shipment_id    TEXT PRIMARY KEY,            -- 'SHP-88-10432'
  order_ref      TEXT NOT NULL,               -- 'ORD10432'
  route_id       TEXT REFERENCES routes(route_id),
  carrier_id     TEXT NOT NULL REFERENCES carriers(carrier_id),
  tracking_id    TEXT NOT NULL UNIQUE,        -- shared key with the carrier feed
  stop_seq       INTEGER,
  planned_eta    TEXT NOT NULL,
  current_eta    TEXT,                        -- NULL = unknown (drives 'Status Unknown')
  status         TEXT NOT NULL
                 CHECK (status IN ('PLANNED','TENDERED','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED')),
  updated_at     TEXT NOT NULL
);

CREATE TABLE milestones (
  milestone_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id    TEXT NOT NULL REFERENCES shipments(shipment_id),
  milestone_type TEXT NOT NULL
                 CHECK (milestone_type IN ('PICKED_UP','DEPARTED_DC','ARRIVED_HUB','OUT_FOR_DELIVERY','DELIVERED')),
  planned_at     TEXT NOT NULL,
  actual_at      TEXT                         -- NULL until it happens; overdue = stalled milestone
);

CREATE TABLE delivery_attempts (
  attempt_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id    TEXT NOT NULL REFERENCES shipments(shipment_id),
  attempt_no     INTEGER NOT NULL DEFAULT 1,
  outcome        TEXT NOT NULL CHECK (outcome IN ('DELIVERED','FAILED')),
  failure_reason TEXT CHECK (failure_reason IN ('SITE_CLOSED','NO_ACCESS','WRONG_ADDRESS','DAMAGED','REFUSED') OR failure_reason IS NULL),
  signed_by      TEXT,
  attempted_at   TEXT NOT NULL
);

-- Carrier feed: raw third-party events, own vocabulary, ingested by webhook or polling.
CREATE TABLE carrier_events (
  event_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  carrier_id     TEXT NOT NULL REFERENCES carriers(carrier_id),
  tracking_id    TEXT NOT NULL,
  event_code     TEXT NOT NULL,               -- 'PU','DEP','ARR','OFD','DEL','EXC'
  event_ts       TEXT NOT NULL,
  location       TEXT,
  note           TEXT,
  raw_json       TEXT,                        -- original payload
  received_at    TEXT NOT NULL
);

CREATE INDEX idx_ship_updated   ON shipments(updated_at);
CREATE INDEX idx_ship_order     ON shipments(order_ref);
CREATE INDEX idx_ship_status    ON shipments(status);
CREATE INDEX idx_miles_ship     ON milestones(shipment_id);
CREATE INDEX idx_cevents_track  ON carrier_events(tracking_id, event_ts);
