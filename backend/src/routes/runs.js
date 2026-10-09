const express = require('express');
const { HttpError } = require('../errors');
const { createRun, listRuns, latestRun, requireCompletedRun } = require('../services/runs');
const { simulateRun } = require('../simulation/engine');
const { buildSummary, buildDaily, listDailyTransactions, productTrace } = require('../services/reports');
const { buildAssurance } = require('../services/assurance');
const { buildDeclaration } = require('../services/declaration');

function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, `${label} must be a positive integer`);
  return n;
}

module.exports = function runsRouter(db) {
  const router = express.Router();

  router.get('/runs', (req, res) => res.json(listRuns(db)));
  router.get('/runs/latest', (req, res) => res.json(latestRun(db)));

  router.post('/runs/init', (req, res) => {
    const seed = req.body?.seed === undefined ? undefined : Number(req.body.seed);
    res.json({ message: 'Run initialised', ...createRun(db, { runName: req.body?.runName, seed }) });
  });

  router.post('/runs/:runId/simulate', (req, res) => {
    const result = simulateRun(db, parseId(req.params.runId, 'runId'));
    res.json({ message: `Successfully simulated ${result.days} days for Run ${result.runId}`, ...result });
  });

  // ---- reports (read-only; completed runs only) ----
  router.get('/runs/:runId/config', (req, res) => {
    const run = requireCompletedRun(db, parseId(req.params.runId, 'runId'));
    const products = db.prepare('SELECT * FROM products WHERE run_id = ? ORDER BY category, name').all(run.id);
    res.json({ declaration: buildDeclaration(run, products), products });
  });

  router.get('/runs/:runId/summary', (req, res) => {
    const run = requireCompletedRun(db, parseId(req.params.runId, 'runId'));
    res.json(buildSummary(db, run.id));
  });

  router.get('/runs/:runId/assurance', (req, res) => {
    const run = requireCompletedRun(db, parseId(req.params.runId, 'runId'));
    res.json(buildAssurance(db, run.id, run));
  });

  router.get('/runs/:runId/daily/:day', (req, res) => {
    const run = requireCompletedRun(db, parseId(req.params.runId, 'runId'));
    res.json(buildDaily(db, run.id, Number(req.params.day)));
  });

  router.get('/runs/:runId/daily/:day/transactions', (req, res) => {
    const run = requireCompletedRun(db, parseId(req.params.runId, 'runId'));
    const day = parseId(req.params.day, 'day');
    res.json(listDailyTransactions(db, run.id, day));
  });

  router.get('/runs/:runId/products/:productId/trace', (req, res) => {
    const run = requireCompletedRun(db, parseId(req.params.runId, 'runId'));
    res.json(productTrace(db, run.id, parseId(req.params.productId, 'productId')));
  });

  return router;
};
