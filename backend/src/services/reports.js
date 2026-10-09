const { EVENT_TYPES } = require('../config');
const { HttpError } = require('../errors');

const WEEKEND_SQL = '((day - 1) % 7) >= 5';

function businessTotals(db, runId) {
  const f = db.prepare(`
    SELECT SUM(customers) AS customers, SUM(transactions) AS transactions, SUM(walkouts) AS walkouts,
           SUM(units_sold) AS units, SUM(sales_revenue) AS revenue, SUM(cogs) AS cogs,
           SUM(writeoff_value) AS writeoff_value, SUM(replenishment_cost) AS replenishment_spend
    FROM daily_financials WHERE run_id = ?`).get(runId);
  const closingCash = db.prepare('SELECT closing_cash FROM daily_financials WHERE run_id = ? AND day = (SELECT MAX(day) FROM daily_financials WHERE run_id = ?)').get(runId, runId);
  const closingInv = db.prepare(`
    SELECT COALESCE(SUM(l.qty * p.unit_cost), 0) AS value, COALESCE(SUM(l.qty), 0) AS units
    FROM (SELECT product_id, SUM(qty_change) AS qty FROM inventory_ledger WHERE run_id = ? GROUP BY product_id) l
    JOIN products p ON p.id = l.product_id`).get(runId);
  return {
    total_customers: f.customers,
    total_transactions: f.transactions,
    walkouts: f.walkouts,
    total_units_sold: f.units,
    total_revenue: f.revenue,
    total_cogs: f.cogs,
    gross_profit: f.revenue - f.cogs,
    total_writeoff_value: f.writeoff_value,
    total_replenishment_spend: f.replenishment_spend,
    closing_cash: closingCash?.closing_cash ?? null,
    closing_inventory_value: closingInv.value,
    closing_inventory_units: closingInv.units,
  };
}

function shopperStats(db, runId, totals) {
  const days = db.prepare('SELECT COUNT(*) AS n FROM daily_financials WHERE run_id = ?').get(runId).n || 1;
  const split = db.prepare(`
    SELECT CASE WHEN ${WEEKEND_SQL} THEN 'weekend' ELSE 'weekday' END AS day_type,
           COUNT(*) AS days, AVG(customers) AS avg_customers, AVG(transactions) AS avg_transactions,
           AVG(sales_revenue) AS avg_revenue, SUM(sales_revenue) * 1.0 / NULLIF(SUM(transactions), 0) AS avg_transaction_value,
           SUM(units_sold) * 1.0 / NULLIF(SUM(transactions), 0) AS avg_basket_units
    FROM daily_financials WHERE run_id = ? GROUP BY day_type`).all(runId);
  const series = db.prepare(`
    SELECT day, customers, transactions, walkouts, sales_revenue AS revenue,
           CASE WHEN ${WEEKEND_SQL} THEN 'weekend' ELSE 'weekday' END AS day_type
    FROM daily_financials WHERE run_id = ? ORDER BY day`).all(runId);
  const missions = db.prepare(`
    SELECT t.customer_type AS mission, COUNT(*) AS transactions, SUM(t.total_revenue) AS revenue,
           SUM(i.units) * 1.0 / COUNT(*) AS avg_basket_units
    FROM transactions t JOIN (SELECT transaction_id, SUM(qty) AS units FROM transaction_items WHERE run_id = ? GROUP BY transaction_id) i
      ON i.transaction_id = t.id
    WHERE t.run_id = ? GROUP BY t.customer_type ORDER BY revenue DESC`).all(runId, runId);
  const hourly = db.prepare('SELECT hour, COUNT(*) AS transactions, SUM(total_revenue) AS revenue FROM transactions WHERE run_id = ? GROUP BY hour ORDER BY hour').all(runId);

  return {
    avg_customers_per_day: totals.total_customers / days,
    avg_transaction_value: totals.total_revenue / (totals.total_transactions || 1),
    avg_basket_size: totals.total_units_sold / (totals.total_transactions || 1),
    conversion_rate: totals.total_transactions / (totals.total_customers || 1),
    weekday_weekend: split,
    daily_series: series,
    by_mission: missions,
    by_hour: hourly,
  };
}

function productPerformance(db, runId) {
  return db.prepare(`
    SELECT p.id AS product_id, p.sku, p.name, p.category, p.initial_qty,
           COALESCE(SUM(ti.qty), 0) AS units_sold,
           COALESCE(SUM(ti.qty * ti.price_at_sale), 0) AS revenue,
           COALESCE(SUM(ti.qty * (ti.price_at_sale - p.unit_cost)), 0) AS gross_profit
    FROM products p LEFT JOIN transaction_items ti ON ti.product_id = p.id AND ti.run_id = p.run_id
    WHERE p.run_id = ? GROUP BY p.id`).all(runId);
}

function categoryPerformance(db, runId) {
  return db.prepare(`
    SELECT p.category, COALESCE(SUM(ti.qty), 0) AS units_sold,
           COALESCE(SUM(ti.qty * ti.price_at_sale), 0) AS revenue,
           COALESCE(SUM(ti.qty * (ti.price_at_sale - p.unit_cost)), 0) AS gross_profit
    FROM products p LEFT JOIN transaction_items ti ON ti.product_id = p.id AND ti.run_id = p.run_id
    WHERE p.run_id = ? GROUP BY p.category ORDER BY revenue DESC`).all(runId);
}

function inventoryHealth(db, runId) {
  const writeOffTotals = db.prepare(`
    SELECT COALESCE(SUM(-l.qty_change), 0) AS total_expired_units,
           COALESCE(SUM(-l.qty_change * p.unit_cost), 0) AS total_writeoff_value
    FROM inventory_ledger l JOIN products p ON p.id = l.product_id
    WHERE l.run_id = ? AND l.reason = 'write-off'`).get(runId);
  const writeOffByProduct = db.prepare(`
    SELECT p.id AS product_id, p.name, p.category, SUM(-l.qty_change) AS units, SUM(-l.qty_change * p.unit_cost) AS value
    FROM inventory_ledger l JOIN products p ON p.id = l.product_id
    WHERE l.run_id = ? AND l.reason = 'write-off' GROUP BY p.id ORDER BY value DESC`).all(runId);
  const writeOffByCategory = db.prepare(`
    SELECT p.category, SUM(-l.qty_change) AS units, SUM(-l.qty_change * p.unit_cost) AS value
    FROM inventory_ledger l JOIN products p ON p.id = l.product_id
    WHERE l.run_id = ? AND l.reason = 'write-off' GROUP BY p.category ORDER BY value DESC`).all(runId);
  const stockout = db.prepare(`
    SELECT COUNT(*) AS product_days, COUNT(DISTINCT product_id) AS products
    FROM daily_inventory WHERE run_id = ? AND closing_qty = 0`).get(runId);
  const slowMovers = db.prepare(`
    SELECT p.id AS product_id, p.name, p.category, di.closing_qty, di.closing_qty * p.unit_cost AS value,
           (SELECT COALESCE(SUM(qty), 0) FROM transaction_items WHERE run_id = p.run_id AND product_id = p.id) AS units_sold
    FROM daily_inventory di JOIN products p ON p.id = di.product_id
    WHERE di.run_id = ? AND di.state = 'slow_moving' AND di.day = (SELECT MAX(day) FROM daily_inventory WHERE run_id = ?)
    ORDER BY value DESC`).all(runId, runId);
  const replenishmentByCategory = db.prepare(`
    SELECT p.category, SUM(o.qty) AS units_ordered, SUM(o.cost) AS spend, COUNT(*) AS orders
    FROM replenishment_orders o JOIN products p ON p.id = o.product_id
    WHERE o.run_id = ? GROUP BY p.category ORDER BY spend DESC`).all(runId);
  const closingByCategory = db.prepare(`
    SELECT p.category, SUM(di.closing_qty) AS units, SUM(di.closing_qty * p.unit_cost) AS value
    FROM daily_inventory di JOIN products p ON p.id = di.product_id
    WHERE di.run_id = ? AND di.day = (SELECT MAX(day) FROM daily_inventory WHERE run_id = ?)
    GROUP BY p.category ORDER BY value DESC`).all(runId, runId);
  const stockoutByProduct = db.prepare(`
    SELECT p.id AS product_id, p.name, p.category, COUNT(*) AS days_out
    FROM daily_inventory di JOIN products p ON p.id = di.product_id
    WHERE di.run_id = ? AND di.closing_qty = 0 GROUP BY p.id ORDER BY days_out DESC LIMIT 10`).all(runId);

  return {
    ...writeOffTotals,
    stockout_product_days: stockout.product_days,
    products_that_stocked_out: stockout.products,
    stockout_by_product: stockoutByProduct,
    writeoff_by_product: writeOffByProduct,
    writeoff_by_category: writeOffByCategory,
    slow_moving_products: slowMovers,
    replenishment_by_category: replenishmentByCategory,
    closing_by_category: closingByCategory,
  };
}

function storeBrainSummary(db, runId) {
  const rows = db.prepare('SELECT event_type, COUNT(*) AS count, COALESCE(SUM(cost), 0) AS total_cost, COALESCE(SUM(qty), 0) AS total_qty FROM store_brain_logs WHERE run_id = ? GROUP BY event_type').all(runId);
  const byType = new Map(rows.map((r) => [r.event_type, r]));
  // Event types that never occurred are reported as zero, not omitted.
  return EVENT_TYPES.map((t) => byType.get(t) || { event_type: t, count: 0, total_cost: 0, total_qty: 0 });
}

// Detected condition -> action taken -> recorded outcome, for the most material stockouts.
function stockoutCases(db, runId, limit = 10) {
  return db.prepare(`
    SELECT b.day, p.id AS product_id, p.name, p.category,
           o.qty AS ordered_qty, o.cost AS order_cost, o.day_due,
           nx.closing_qty AS next_day_closing_qty, nx.received AS next_day_received, nx.state AS next_day_state
    FROM store_brain_logs b
    JOIN products p ON p.id = b.product_id
    LEFT JOIN replenishment_orders o ON o.run_id = b.run_id AND o.product_id = b.product_id AND o.day_placed = b.day
    LEFT JOIN daily_inventory nx ON nx.run_id = b.run_id AND nx.product_id = b.product_id AND nx.day = b.day + 1
    WHERE b.run_id = ? AND b.event_type = 'sold_out'
    ORDER BY (p.unit_price - p.unit_cost) * p.popularity DESC, b.day LIMIT ?`).all(runId, limit);
}

function cashConstrainedCases(db, runId) {
  return db.prepare(`
    SELECT b.day, p.name, b.qty AS units_not_ordered, b.cost AS value_not_ordered, b.detail
    FROM store_brain_logs b JOIN products p ON p.id = b.product_id
    WHERE b.run_id = ? AND b.event_type = 'cash_constrained' ORDER BY b.day LIMIT 50`).all(runId);
}

function buildSummary(db, runId) {
  const run = db.prepare('SELECT id, run_name, status, seed, created_at, completed_at FROM runs WHERE id = ?').get(runId);
  const business = businessTotals(db, runId);
  const shopper = shopperStats(db, runId, business);
  const products = productPerformance(db, runId);
  const byUnits = [...products].sort((a, b) => b.units_sold - a.units_sold || b.revenue - a.revenue);
  const health = inventoryHealth(db, runId);
  const closing = { closing_value: business.closing_inventory_value };

  return {
    run,
    business,
    categories: categoryPerformance(db, runId),
    inventory_health: health,
    closing_inventory: closing,
    store_brain: storeBrainSummary(db, runId),
    shopper_stats: shopper,
    top_products: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    bottom_products: byUnits.slice(-5).reverse(),
    stockout_cases: stockoutCases(db, runId),
    cash_constrained_cases: cashConstrainedCases(db, runId),
  };
}

function buildDaily(db, runId, day) {
  if (!Number.isInteger(day) || day < 1 || day > 60) throw new HttpError(400, 'day must be an integer from 1 to 60');
  const financials = db.prepare('SELECT * FROM daily_financials WHERE run_id = ? AND day = ?').get(runId, day);
  if (!financials) throw new HttpError(404, `No record for day ${day} of run ${runId}`);

  const events = db.prepare(`
    SELECT b.*, p.name FROM store_brain_logs b JOIN products p ON p.id = b.product_id
    WHERE b.run_id = ? AND b.day = ? ORDER BY b.id`).all(runId, day);
  const orders = db.prepare(`
    SELECT o.*, p.name FROM replenishment_orders o JOIN products p ON p.id = o.product_id
    WHERE o.run_id = ? AND o.day_placed = ? ORDER BY o.id`).all(runId, day);
  const inventory = db.prepare(`
    SELECT di.*, p.name, p.category FROM daily_inventory di JOIN products p ON p.id = di.product_id
    WHERE di.run_id = ? AND di.day = ? ORDER BY p.category, p.name`).all(runId, day);
  const hourly = db.prepare('SELECT hour, COUNT(*) AS transactions, SUM(total_revenue) AS revenue FROM transactions WHERE run_id = ? AND day = ? GROUP BY hour ORDER BY hour').all(runId, day);
  const topSellers = db.prepare(`
    SELECT p.name, SUM(ti.qty) AS units, SUM(ti.qty * ti.price_at_sale) AS revenue
    FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id JOIN products p ON p.id = ti.product_id
    WHERE t.run_id = ? AND t.day = ? GROUP BY p.id ORDER BY revenue DESC LIMIT 5`).all(runId, day);

  return {
    day,
    day_type: (day - 1) % 7 >= 5 ? 'weekend' : 'weekday',
    financials: { ...financials, gross_profit: financials.sales_revenue - financials.cogs },
    store_brain_actions: events,
    replenishment_orders: orders,
    inventory,
    hourly_sales: hourly,
    top_sellers: topSellers,
  };
}

function listDailyTransactions(db, runId, day) {
  const txns = db.prepare('SELECT id, hour, customer_type, total_revenue FROM transactions WHERE run_id = ? AND day = ? ORDER BY id').all(runId, day);
  const items = db.prepare(`
    SELECT ti.transaction_id, p.name, ti.qty, ti.price_at_sale
    FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id JOIN products p ON p.id = ti.product_id
    WHERE t.run_id = ? AND t.day = ? ORDER BY ti.id`).all(runId, day);
  const byTxn = new Map();
  for (const i of items) {
    if (!byTxn.has(i.transaction_id)) byTxn.set(i.transaction_id, []);
    byTxn.get(i.transaction_id).push(i);
  }
  return txns.map((t) => ({ ...t, items: byTxn.get(t.id) || [] }));
}

// Full audit trail for one product: every ledger movement, order and Store Brain event.
function productTrace(db, runId, productId) {
  const product = db.prepare('SELECT * FROM products WHERE run_id = ? AND id = ?').get(runId, productId);
  if (!product) throw new HttpError(404, `Product ${productId} not found in run ${runId}`);
  return {
    product,
    daily: db.prepare('SELECT * FROM daily_inventory WHERE run_id = ? AND product_id = ? ORDER BY day').all(runId, productId),
    ledger: db.prepare('SELECT * FROM inventory_ledger WHERE run_id = ? AND product_id = ? ORDER BY id').all(runId, productId),
    orders: db.prepare('SELECT * FROM replenishment_orders WHERE run_id = ? AND product_id = ? ORDER BY id').all(runId, productId),
    brain_events: db.prepare('SELECT * FROM store_brain_logs WHERE run_id = ? AND product_id = ? ORDER BY id').all(runId, productId),
  };
}

module.exports = { buildSummary, buildDaily, listDailyTransactions, productTrace };
