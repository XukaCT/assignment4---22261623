// Creates, simulates and marks the Submitted Run in supermarket.db.
// Usage: npm run seed [-- --seed 12345]
const { openDatabase } = require('../src/db');
const { createRun } = require('../src/services/runs');
const { simulateRun } = require('../src/simulation/engine');
const { buildAssurance } = require('../src/services/assurance');

const db = openDatabase();
const existing = db.prepare('SELECT run_id FROM submitted_run WHERE id = 1').get();
if (existing) {
  console.log(`Submitted Run already set: Run ${existing.run_id}. Nothing to do.`);
  process.exit(0);
}

const argIdx = process.argv.indexOf('--seed');
const seed = argIdx > -1 ? Number(process.argv[argIdx + 1]) : 20260604;

const started = Date.now();
const { runId } = createRun(db, { runName: 'Submitted Run', seed });
simulateRun(db, runId);
const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
const assurance = buildAssurance(db, runId, run);

if (assurance.overall_status !== 'PASS') {
  console.error('Assurance FAILED for the new run; it was not marked as submitted.');
  console.error(JSON.stringify(assurance.exceptions, null, 2));
  process.exit(1);
}

db.prepare('INSERT INTO submitted_run (id, run_id) VALUES (1, ?)').run(runId);
console.log(`Submitted Run = Run ${runId} (seed ${seed}), simulated in ${Date.now() - started} ms. Assurance: PASS`);
