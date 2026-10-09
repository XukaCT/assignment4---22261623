const fs = require('fs');
const path = require('path');
const { CLIENT, MODEL_PARAMS } = require('../config');
const { HttpError } = require('../errors');
const { createRng } = require('../rng');
const { drawPopularity } = require('../simulation/demand');

const PRODUCTS_FILE = process.env.PRODUCTS_FILE || path.resolve(__dirname, '..', '..', 'products.json');

function loadCatalogue(file = PRODUCTS_FILE) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  rows.forEach((p, i) => {
    const label = p.name || `row ${i + 1}`;
    if (!p.name || !p.category) problems.push(`${label}: name and category are required`);
    if (!(p.unit_cost > 0) || !(p.unit_price > p.unit_cost)) problems.push(`${label}: price must exceed cost and both must be positive`);
    if (!Number.isInteger(p.initial_qty) || p.initial_qty < 0) problems.push(`${label}: initial_qty must be a non-negative integer`);
    if (p.is_perishable && !(p.shelf_life_days >= 1)) problems.push(`${label}: perishable products need shelf_life_days`);
  });
  if (problems.length) throw new HttpError(400, `Invalid product catalogue: ${problems.join('; ')}`);
  return rows;
}

function createRun(db, { runName, seed } = {}) {
  const catalogue = loadCatalogue();
  const openingInventoryCost = Number(catalogue.reduce((s, p) => s + p.unit_cost * p.initial_qty, 0).toFixed(2));
  if (openingInventoryCost > CLIENT.inventoryBudget) {
    throw new HttpError(400, `Opening inventory A$${openingInventoryCost} exceeds the A$${CLIENT.inventoryBudget} budget.`);
  }

  const runSeed = Number.isInteger(seed) ? seed : Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(runSeed ^ 0x9e3779b9);
  const config = { client: CLIENT, ...MODEL_PARAMS, openingInventoryCost };

  const insertRun = db.prepare('INSERT INTO runs (run_name, seed, opening_cash, inventory_budget, config_json) VALUES (?,?,?,?,?)');
  const insertProduct = db.prepare('INSERT INTO products (run_id, sku, name, category, unit_cost, unit_price, initial_qty, is_perishable, shelf_life_days, popularity) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const insertLedger = db.prepare("INSERT INTO inventory_ledger (run_id, day, product_id, qty_change, reason, batch_day) VALUES (?,1,?,?,'opening',1)");

  const create = db.transaction(() => {
    const name = runName || `Simulation Run ${new Date().toISOString()}`;
    const runId = insertRun.run(name, runSeed, CLIENT.openingCash, CLIENT.inventoryBudget, JSON.stringify(config)).lastInsertRowid;
    catalogue.forEach((p, i) => {
      const popularity = drawPopularity(rng, p, MODEL_PARAMS);
      const productId = insertProduct.run(
        runId, p.sku || p.id || `P${String(i + 1).padStart(3, '0')}`, p.name, p.category, p.unit_cost, p.unit_price,
        p.initial_qty, p.is_perishable ? 1 : 0, p.is_perishable ? p.shelf_life_days : null, popularity,
      ).lastInsertRowid;
      if (p.initial_qty > 0) insertLedger.run(runId, productId, p.initial_qty);
    });
    return runId;
  });

  const runId = create();
  return { runId, seed: runSeed, productCount: catalogue.length, initialInventoryCost: openingInventoryCost };
}

function listRuns(db) {
  const submitted = db.prepare('SELECT run_id FROM submitted_run WHERE id = 1').get();
  return db.prepare('SELECT id, run_name, status, seed, created_at, completed_at FROM runs ORDER BY id DESC').all()
    .map((r) => ({ ...r, is_submitted: submitted?.run_id === r.id }));
}

// The Submitted Run takes priority; otherwise the newest completed run.
function latestRun(db) {
  const submitted = db.prepare('SELECT run_id AS id FROM submitted_run WHERE id = 1').get();
  if (submitted) return { id: submitted.id, is_submitted: true };
  const row = db.prepare("SELECT id FROM runs WHERE status = 'completed' ORDER BY id DESC LIMIT 1").get();
  return row ? { id: row.id, is_submitted: false } : { id: null };
}

function requireCompletedRun(db, runId) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!run) throw new HttpError(404, `Run ${runId} not found`);
  if (run.status !== 'completed') throw new HttpError(409, `Run ${runId} is ${run.status}; simulate it first`);
  return run;
}

module.exports = { createRun, listRuns, latestRun, requireCompletedRun, loadCatalogue };
