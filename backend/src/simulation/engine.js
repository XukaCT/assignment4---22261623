const { CLIENT } = require('../config');
const { HttpError } = require('../errors');
const { createRng } = require('../rng');
const { categoryGroup, generateCustomers, buildBasket } = require('./demand');
const { review, STATE } = require('./storeBrain');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function prepareStatements(db) {
  return {
    ledger: db.prepare('INSERT INTO inventory_ledger (run_id, day, product_id, qty_change, reason, batch_day) VALUES (?,?,?,?,?,?)'),
    txn: db.prepare('INSERT INTO transactions (run_id, day, hour, customer_type, total_revenue) VALUES (?,?,?,?,?)'),
    item: db.prepare('INSERT INTO transaction_items (run_id, transaction_id, product_id, qty, price_at_sale) VALUES (?,?,?,?,?)'),
    brain: db.prepare('INSERT INTO store_brain_logs (run_id, day, product_id, event_type, qty, cost, detail) VALUES (?,?,?,?,?,?,?)'),
    order: db.prepare('INSERT INTO replenishment_orders (run_id, product_id, day_placed, day_due, qty, cost, cash_before, cash_after, reason) VALUES (?,?,?,?,?,?,?,?,?)'),
    fin: db.prepare('INSERT INTO daily_financials (run_id, day, customers, transactions, walkouts, units_sold, opening_cash, sales_revenue, cogs, writeoff_value, replenishment_cost, closing_cash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'),
    inv: db.prepare('INSERT INTO daily_inventory (run_id, day, product_id, opening_qty, received, sold, expired, closing_qty, state) VALUES (?,?,?,?,?,?,?,?,?)'),
  };
}

function loadState(db, runId) {
  const products = db.prepare('SELECT * FROM products WHERE run_id = ? ORDER BY id').all(runId);
  const stock = new Map();
  for (const p of products) {
    stock.set(p.id, {
      p,
      group: categoryGroup(p.category),
      qty: p.initial_qty,
      batches: p.initial_qty > 0 ? [{ day: 1, qty: p.initial_qty }] : [], // FIFO, oldest first
      soldByDay: [],
      lifetimeSold: 0,
      state: STATE.OK,
      warned: new Set(),
    });
  }
  return stock;
}

function simulateRun(db, runId) {
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
  if (!run) throw new HttpError(404, `Run ${runId} not found`);
  if (run.status !== 'initialised') throw new HttpError(409, `Run ${runId} is already ${run.status}; start a new run instead`);

  const params = JSON.parse(run.config_json);
  const days = params.client.simDays;
  const leadTime = params.client.leadTimeDays;
  const rng = createRng(run.seed);
  const stock = loadState(db, runId);
  const sql = prepareStatements(db);
  const pendingOrders = [];
  let cash = run.opening_cash;

  const execute = db.transaction(() => {
    db.prepare("UPDATE runs SET status = 'running' WHERE id = ?").run(runId);

    for (let day = 1; day <= days; day += 1) {
      const rec = new Map([...stock.keys()].map((id) => [id, { opening: stock.get(id).qty, received: 0, sold: 0, expired: 0 }]));
      const openingCash = cash;

      // 1. Morning: receive yesterday's orders, then remove expired stock
      for (const o of pendingOrders.filter((x) => x.dueDay === day)) {
        const s = stock.get(o.productId);
        s.batches.push({ day, qty: o.qty });
        s.qty += o.qty;
        rec.get(o.productId).received += o.qty;
        sql.ledger.run(runId, day, o.productId, o.qty, 'replenishment', day);
      }
      let writeoffValue = 0;
      for (const s of stock.values()) {
        if (!s.p.is_perishable) continue;
        const keep = [];
        for (const b of s.batches) {
          if (day - b.day >= s.p.shelf_life_days) {
            const value = round2(b.qty * s.p.unit_cost);
            writeoffValue += value;
            s.qty -= b.qty;
            rec.get(s.p.id).expired += b.qty;
            sql.ledger.run(runId, day, s.p.id, -b.qty, 'write-off', b.day);
            sql.brain.run(runId, day, s.p.id, 'expired', b.qty, value, `Batch received day ${b.day} reached its ${s.p.shelf_life_days}-day shelf life and was removed from sale.`);
          } else keep.push(b);
        }
        s.batches = keep;
      }

      // 2. Trading: customers shop in arrival order
      const customers = generateCustomers(rng, day, params);
      const soldByBatch = new Map(); // "productId:batchDay" -> qty
      const soldToday = new Map();
      let revenue = 0;
      let cogs = 0;
      let units = 0;
      let transactions = 0;
      let walkouts = 0;

      for (const cust of customers) {
        const available = [];
        for (const s of stock.values()) {
          if (s.qty > 0) available.push({ id: s.p.id, group: s.group, popularity: s.p.popularity, unitPrice: s.p.unit_price, qty: s.qty });
        }
        const basket = buildBasket(rng, cust.mission, available, params);
        if (basket.length === 0) { walkouts += 1; continue; }

        const total = round2(basket.reduce((sum, l) => sum + l.qty * stock.get(l.productId).p.unit_price, 0));
        const txnId = sql.txn.run(runId, day, cust.hour, cust.mission, total).lastInsertRowid;

        for (const line of basket) {
          const s = stock.get(line.productId);
          let need = line.qty;
          while (need > 0) {
            const batch = s.batches[0]; // FIFO: oldest, still-valid batch first
            const take = Math.min(need, batch.qty);
            batch.qty -= take;
            need -= take;
            if (batch.qty === 0) s.batches.shift();
            const key = `${s.p.id}:${batch.day}`;
            soldByBatch.set(key, (soldByBatch.get(key) || 0) + take);
          }
          s.qty -= line.qty;
          s.lifetimeSold += line.qty;
          soldToday.set(s.p.id, (soldToday.get(s.p.id) || 0) + line.qty);
          rec.get(s.p.id).sold += line.qty;
          sql.item.run(runId, txnId, s.p.id, line.qty, s.p.unit_price);
          cogs += line.qty * s.p.unit_cost;
          units += line.qty;
        }
        revenue += total;
        transactions += 1;
      }
      for (const [key, qty] of soldByBatch) {
        const [pid, batchDay] = key.split(':').map(Number);
        sql.ledger.run(runId, day, pid, -qty, 'sale', batchDay);
      }
      for (const s of stock.values()) s.soldByDay.push(soldToday.get(s.p.id) || 0);
      revenue = round2(revenue);
      cogs = round2(cogs);
      cash = round2(cash + revenue);

      // 3. Close: Store Brain reviews the closing state and orders for tomorrow
      const window = Math.min(day, params.brain.demandWindowDays);
      const items = [...stock.values()].map((s) => {
        const recent = s.soldByDay.slice(-window).reduce((a, b) => a + b, 0);
        return {
          id: s.p.id,
          name: s.p.name,
          onHand: s.qty,
          avgDaily: recent / window,
          lifetimeRate: s.lifetimeSold / day,
          isPerishable: !!s.p.is_perishable,
          shelfLife: s.p.shelf_life_days,
          unitCost: s.p.unit_cost,
          unitPrice: s.p.unit_price,
          prevState: s.state,
          warnedBatches: s.warned,
          batches: s.p.is_perishable
            ? s.batches.map((b) => ({ batchDay: b.day, qty: b.qty, daysToExpiry: b.day + s.p.shelf_life_days - day }))
            : [],
        };
      });
      const result = review({ day, finalDay: days, cash, params, leadTime, items });

      for (const e of result.events) sql.brain.run(runId, day, e.productId, e.type, e.qty ?? null, e.cost ?? null, e.detail ?? null);
      for (const o of result.orders) {
        sql.order.run(runId, o.productId, day, day + leadTime, o.qty, o.cost, o.cashBefore, o.cashAfter, o.reason);
        pendingOrders.push({ productId: o.productId, qty: o.qty, dueDay: day + leadTime });
      }
      cash = round2(cash - result.spent);

      for (const s of stock.values()) {
        s.state = result.states.get(s.p.id);
        const r = rec.get(s.p.id);
        sql.inv.run(runId, day, s.p.id, r.opening, r.received, r.sold, r.expired, s.qty, s.state);
      }
      sql.fin.run(runId, day, customers.length, transactions, walkouts, units, openingCash, revenue, cogs, round2(writeoffValue), result.spent, cash);
    }

    db.prepare("UPDATE runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(runId);
  });

  execute();
  return { runId, days, closingCash: cash };
}

module.exports = { simulateRun, CLIENT };
