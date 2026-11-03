-- Simulation control DB. NOT a source system: DelIQ must never read this directly.
CREATE TABLE sim_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE sim_script (            -- pre-computed future events, applied as the clock advances
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  due_at   TEXT NOT NULL,            -- simulated time (ISO, UTC)
  order_id TEXT,
  tag      TEXT NOT NULL,            -- e.g. tms_delivered, c_ofd (used by inject commands)
  sys      TEXT NOT NULL CHECK (sys IN ('erp','wms','tms')),
  sql      TEXT NOT NULL,
  params   TEXT NOT NULL DEFAULT '[]',
  webhook  TEXT,                     -- JSON payload POSTed to DELIQ_WEBHOOK_URL when applied
  applied  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_script_due ON sim_script(applied, due_at, id);
CREATE INDEX idx_script_order ON sim_script(order_id, applied);

CREATE TABLE planted_exceptions (    -- ground truth for precision/recall of DelIQ detection
  order_id       TEXT PRIMARY KEY,
  exception_type TEXT NOT NULL,
  delay_min      INTEGER,
  is_hero        INTEGER NOT NULL DEFAULT 0,
  note           TEXT
);
