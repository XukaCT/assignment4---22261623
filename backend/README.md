# Autonomous Supermarket - Backend

Node.js + Express + SQLite (better-sqlite3) API for the 60-day autonomous IGA-style supermarket simulation.

## Run it
```bash
cd backend
npm install
# place your catalogue at backend/products.json (fields: name, category, unit_cost, unit_price,
# initial_qty, is_perishable, shelf_life_days; optional sku)
npm run seed     # creates, simulates and locks the Submitted Run (only once)
npm run dev      # API on http://localhost:3000
```
Requires Node 18+. Env vars (optional): `PORT`, `DB_PATH`, `PRODUCTS_FILE`.
Delete any old `supermarket.db` created by the previous schema before the first run.

## Layout
```
src/
  config.js              client constraints + all model parameters (frozen into each run)
  schema.sql, db.js      tables, indexes, immutability triggers
  rng.js                 seeded random generator (reproducible per run seed)
  simulation/
    demand.js            customers, missions, baskets (the Simulated Store World)
    storeBrain.js        pure rule-based reviewer (the Autonomous Store Brain)
    engine.js            daily loop + persistence
  services/
    runs.js              create run, validate catalogue and A$40,000 budget
    reports.js           60-day summary, daily report, drill-down queries
    assurance.js         inventory / revenue / cash reconciliation, PASS/FAIL
    declaration.js       Model Declaration generated from the run's frozen config
  routes/runs.js         HTTP endpoints
scripts/seed-submitted-run.js
```

## Data flow
`config.js` -> frozen into `runs.config_json` -> `engine.js` appends history to SQLite -> `reports.js` and `assurance.js` read only from SQLite.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | /api/runs/init | create a run (optional body: runName, seed) |
| POST | /api/runs/:id/simulate | simulate 60 days (once per run) |
| GET | /api/runs, /api/runs/latest | list runs; latest returns the Submitted Run if set |
| GET | /api/runs/:id/config | Model Declaration + product data |
| GET | /api/runs/:id/summary | 60-day Commercial Report data |
| GET | /api/runs/:id/daily/:day | Daily Report |
| GET | /api/runs/:id/daily/:day/transactions | every basket that day |
| GET | /api/runs/:id/products/:pid/trace | ledger, orders, Store Brain events for a product |
| GET | /api/runs/:id/assurance | Commercial Assurance checks |
