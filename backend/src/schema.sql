-- Configuration ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_name         TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'initialised'
                   CHECK (status IN ('initialised','running','completed')),
  seed             INTEGER NOT NULL,
  opening_cash     REAL    NOT NULL,
  inventory_budget REAL    NOT NULL,
  config_json      TEXT    NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at     TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES runs(id),
  sku             TEXT,
  name            TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  unit_cost       REAL    NOT NULL CHECK (unit_cost > 0),
  unit_price      REAL    NOT NULL CHECK (unit_price > 0),
  initial_qty     INTEGER NOT NULL CHECK (initial_qty >= 0),
  is_perishable   INTEGER NOT NULL CHECK (is_perishable IN (0,1)),
  shelf_life_days INTEGER,
  popularity      REAL    NOT NULL
);

-- Append-only history ----------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL REFERENCES runs(id),
  day        INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_change INTEGER NOT NULL,
  reason     TEXT    NOT NULL CHECK (reason IN ('opening','replenishment','sale','write-off')),
  batch_day  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS replenishment_orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  day_placed  INTEGER NOT NULL,
  day_due     INTEGER NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  cost        REAL    NOT NULL,
  cash_before REAL    NOT NULL,
  cash_after  REAL    NOT NULL,
  reason      TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        INTEGER NOT NULL REFERENCES runs(id),
  day           INTEGER NOT NULL,
  hour          INTEGER NOT NULL,
  customer_type TEXT    NOT NULL,
  total_revenue REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         INTEGER NOT NULL REFERENCES runs(id),
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  product_id     INTEGER NOT NULL REFERENCES products(id),
  qty            INTEGER NOT NULL CHECK (qty > 0),
  price_at_sale  REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS store_brain_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     INTEGER NOT NULL REFERENCES runs(id),
  day        INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  event_type TEXT    NOT NULL,
  qty        INTEGER,
  cost       REAL,
  detail     TEXT
);

CREATE TABLE IF NOT EXISTS daily_financials (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id             INTEGER NOT NULL REFERENCES runs(id),
  day                INTEGER NOT NULL,
  customers          INTEGER NOT NULL,
  transactions       INTEGER NOT NULL,
  walkouts           INTEGER NOT NULL,
  units_sold         INTEGER NOT NULL,
  opening_cash       REAL    NOT NULL,
  sales_revenue      REAL    NOT NULL,
  cogs               REAL    NOT NULL,
  writeoff_value     REAL    NOT NULL,
  replenishment_cost REAL    NOT NULL,
  closing_cash       REAL    NOT NULL,
  UNIQUE (run_id, day)
);

CREATE TABLE IF NOT EXISTS daily_inventory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      INTEGER NOT NULL REFERENCES runs(id),
  day         INTEGER NOT NULL,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  opening_qty INTEGER NOT NULL,
  received    INTEGER NOT NULL,
  sold        INTEGER NOT NULL,
  expired     INTEGER NOT NULL,
  closing_qty INTEGER NOT NULL,
  state       TEXT    NOT NULL,
  UNIQUE (run_id, day, product_id)
);

-- At most one Submitted Run; set once by scripts/seed-submitted-run.js
CREATE TABLE IF NOT EXISTS submitted_run (
  id     INTEGER PRIMARY KEY CHECK (id = 1),
  run_id INTEGER NOT NULL REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_run_prod ON inventory_ledger(run_id, product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_run_day  ON inventory_ledger(run_id, day);
CREATE INDEX IF NOT EXISTS idx_txn_run_day     ON transactions(run_id, day);
CREATE INDEX IF NOT EXISTS idx_items_txn       ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_items_run_prod  ON transaction_items(run_id, product_id);
CREATE INDEX IF NOT EXISTS idx_brain_run_day   ON store_brain_logs(run_id, day);
CREATE INDEX IF NOT EXISTS idx_orders_run_day  ON replenishment_orders(run_id, day_placed);
CREATE INDEX IF NOT EXISTS idx_dinv_run_day    ON daily_inventory(run_id, day);

-- Immutability rules (enforced by the database, not only by the API) ------
CREATE TRIGGER IF NOT EXISTS runs_no_delete BEFORE DELETE ON runs
BEGIN SELECT RAISE(ABORT, 'runs are append-only'); END;

CREATE TRIGGER IF NOT EXISTS runs_frozen_config
BEFORE UPDATE OF run_name, seed, opening_cash, inventory_budget, config_json, created_at ON runs
BEGIN SELECT RAISE(ABORT, 'run configuration is frozen'); END;

CREATE TRIGGER IF NOT EXISTS runs_completed_final
BEFORE UPDATE ON runs WHEN OLD.status = 'completed'
BEGIN SELECT RAISE(ABORT, 'a completed run cannot be modified'); END;

CREATE TRIGGER IF NOT EXISTS submitted_no_update BEFORE UPDATE ON submitted_run
BEGIN SELECT RAISE(ABORT, 'submitted run is fixed'); END;
CREATE TRIGGER IF NOT EXISTS submitted_no_delete BEFORE DELETE ON submitted_run
BEGIN SELECT RAISE(ABORT, 'submitted run is fixed'); END;
CREATE TRIGGER IF NOT EXISTS submitted_requires_completed BEFORE INSERT ON submitted_run
WHEN (SELECT status FROM runs WHERE id = NEW.run_id) <> 'completed'
BEGIN SELECT RAISE(ABORT, 'only a completed run can be submitted'); END;
