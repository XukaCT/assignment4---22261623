const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', 'supermarket.db');

// Tables whose rows may never be updated or deleted once written.
const HISTORY_TABLES = [
  'products',
  'inventory_ledger',
  'replenishment_orders',
  'transactions',
  'transaction_items',
  'store_brain_logs',
  'daily_financials',
  'daily_inventory',
];

// Tables that must not receive rows once their run is completed.
const RUN_SCOPED_TABLES = HISTORY_TABLES;

function installImmutabilityTriggers(db) {
  for (const t of HISTORY_TABLES) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${t}_no_update BEFORE UPDATE ON ${t}
      BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
      CREATE TRIGGER IF NOT EXISTS ${t}_no_delete BEFORE DELETE ON ${t}
      BEGIN SELECT RAISE(ABORT, '${t} is append-only'); END;
    `);
  }
  for (const t of RUN_SCOPED_TABLES) {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS ${t}_run_open BEFORE INSERT ON ${t}
      WHEN (SELECT status FROM runs WHERE id = NEW.run_id) = 'completed'
      BEGIN SELECT RAISE(ABORT, 'run is completed; history is closed'); END;
    `);
  }
}

function openDatabase(dbPath = DB_PATH) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  installImmutabilityTriggers(db);
  return db;
}

module.exports = { openDatabase, DB_PATH };
