const EPS = 0.01;
const status = (ok) => (ok ? 'PASS' : 'FAIL');
const near = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) < EPS;

function historyCompleteness(db, runId, run) {
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE run_id = ?`).get(runId).n;
  const days = db.prepare('SELECT COUNT(DISTINCT day) AS n FROM daily_financials WHERE run_id = ?').get(runId).n;
  const invDays = db.prepare('SELECT COUNT(DISTINCT day) AS n FROM daily_inventory WHERE run_id = ?').get(runId).n;
  const records = {
    transactions: count('transactions'),
    transaction_items: count('transaction_items'),
    inventory_ledger_entries: count('inventory_ledger'),
    daily_inventory_snapshots: count('daily_inventory'),
    replenishment_orders: count('replenishment_orders'),
    store_brain_events: count('store_brain_logs'),
    daily_financial_records: count('daily_financials'),
  };
  const ok = days === 60 && invDays === 60 && run.status === 'completed' && records.transactions > 0 && records.inventory_ledger_entries > 0;
  return { run_id: run.id, run_status: run.status, days_retained: days, days_expected: 60, records, status: status(ok) };
}

function inventoryReconciliation(db, runId) {
  const rows = db.prepare(`
    SELECT p.id AS product_id, p.name,
      SUM(CASE WHEN l.reason = 'opening' THEN l.qty_change ELSE 0 END) AS opening,
      SUM(CASE WHEN l.reason = 'replenishment' THEN l.qty_change ELSE 0 END) AS received,
      SUM(CASE WHEN l.reason = 'sale' THEN -l.qty_change ELSE 0 END) AS sold,
      SUM(CASE WHEN l.reason = 'write-off' THEN -l.qty_change ELSE 0 END) AS expired,
      SUM(l.qty_change) AS ledger_closing,
      (SELECT closing_qty FROM daily_inventory WHERE run_id = p.run_id AND product_id = p.id AND day = 60) AS snapshot_closing,
      (SELECT COALESCE(SUM(qty), 0) FROM transaction_items WHERE run_id = p.run_id AND product_id = p.id) AS transaction_units
    FROM products p LEFT JOIN inventory_ledger l ON l.product_id = p.id AND l.run_id = p.run_id
    WHERE p.run_id = ? GROUP BY p.id`).all(runId);

  const failures = [];
  const totals = { opening: 0, received: 0, sold: 0, expired: 0, closing: 0 };
  for (const r of rows) {
    const expected = r.opening + r.received - r.sold - r.expired;
    totals.opening += r.opening; totals.received += r.received; totals.sold += r.sold; totals.expired += r.expired; totals.closing += r.ledger_closing;
    if (expected !== r.ledger_closing) failures.push({ product_id: r.product_id, name: r.name, issue: `formula gives ${expected}, ledger shows ${r.ledger_closing}` });
    if (r.snapshot_closing !== r.ledger_closing) failures.push({ product_id: r.product_id, name: r.name, issue: `day-60 snapshot ${r.snapshot_closing} differs from ledger ${r.ledger_closing}` });
    if (r.sold !== r.transaction_units) failures.push({ product_id: r.product_id, name: r.name, issue: `ledger sales ${r.sold} differ from transaction units ${r.transaction_units}` });
  }

  const negative = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT l.product_id, l.day, (SELECT SUM(l2.qty_change) FROM inventory_ledger l2 WHERE l2.run_id = l.run_id AND l2.product_id = l.product_id AND l2.id <= l.id) AS running
      FROM inventory_ledger l WHERE l.run_id = ?) WHERE running < 0`).get(runId).n
    + db.prepare('SELECT COUNT(*) AS n FROM daily_inventory WHERE run_id = ? AND closing_qty < 0').get(runId).n;
  const oversold = db.prepare(`
    SELECT COUNT(*) AS n FROM daily_inventory WHERE run_id = ? AND sold > opening_qty + received - expired`).get(runId).n;
  const expiredSales = db.prepare(`
    SELECT COUNT(*) AS n FROM inventory_ledger l JOIN products p ON p.id = l.product_id
    WHERE l.run_id = ? AND l.reason = 'sale' AND p.is_perishable = 1 AND l.day - l.batch_day >= p.shelf_life_days`).get(runId).n;

  const ok = failures.length === 0 && negative === 0 && oversold === 0 && expiredSales === 0;
  return {
    formula: 'opening + replenishment received - units sold - units expired = closing',
    totals: { ...totals, expected_closing: totals.opening + totals.received - totals.sold - totals.expired },
    products_checked: rows.length,
    negative_stock_events: negative,
    overselling_events: oversold,
    expired_product_sales: expiredSales,
    failed_product_ids: failures.map((f) => f.product_id),
    failures,
    status: status(ok),
  };
}

function revenueReconciliation(db, runId) {
  const txnTotal = db.prepare('SELECT COALESCE(SUM(total_revenue), 0) AS v FROM transactions WHERE run_id = ?').get(runId).v;
  const itemTotal = db.prepare('SELECT COALESCE(SUM(qty * price_at_sale), 0) AS v FROM transaction_items WHERE run_id = ?').get(runId).v;
  const dailyTotal = db.prepare('SELECT COALESCE(SUM(sales_revenue), 0) AS v FROM daily_financials WHERE run_id = ?').get(runId).v;
  const badDays = db.prepare(`
    SELECT f.day, f.sales_revenue, COALESCE(t.total, 0) AS transaction_total
    FROM daily_financials f
    LEFT JOIN (SELECT day, SUM(total_revenue) AS total FROM transactions WHERE run_id = ? GROUP BY day) t ON t.day = f.day
    WHERE f.run_id = ? AND ABS(f.sales_revenue - COALESCE(t.total, 0)) >= ?`).all(runId, runId, EPS);
  const badTxns = db.prepare(`
    SELECT COUNT(*) AS n FROM transactions t
    WHERE t.run_id = ? AND ABS(t.total_revenue - (SELECT COALESCE(SUM(qty * price_at_sale), 0) FROM transaction_items WHERE transaction_id = t.id)) >= ?`).get(runId, EPS).n;

  const ok = near(txnTotal, dailyTotal) && near(itemTotal, txnTotal) && badDays.length === 0 && badTxns === 0;
  return {
    financial_total: dailyTotal,
    transaction_total: txnTotal,
    line_item_total: itemTotal,
    days_with_mismatch: badDays,
    transactions_with_mismatch: badTxns,
    status: status(ok),
  };
}

function cashReconciliation(db, runId, run) {
  const flow = db.prepare('SELECT SUM(sales_revenue) AS sales, SUM(replenishment_cost) AS spend FROM daily_financials WHERE run_id = ?').get(runId);
  const finalCash = db.prepare('SELECT closing_cash FROM daily_financials WHERE run_id = ? AND day = 60').get(runId);
  const orderSpend = db.prepare('SELECT COALESCE(SUM(cost), 0) AS v FROM replenishment_orders WHERE run_id = ?').get(runId).v;
  const expected = run.opening_cash + flow.sales - flow.spend;

  const brokenDays = db.prepare(`
    SELECT day FROM daily_financials WHERE run_id = ?
    AND ABS(closing_cash - (opening_cash + sales_revenue - replenishment_cost)) >= ?`).all(runId, EPS);
  const brokenChain = db.prepare(`
    SELECT a.day FROM daily_financials a JOIN daily_financials b ON b.run_id = a.run_id AND b.day = a.day + 1
    WHERE a.run_id = ? AND ABS(a.closing_cash - b.opening_cash) >= ?`).all(runId, EPS);
  const overspent = db.prepare(`
    SELECT COUNT(*) AS n FROM replenishment_orders o
    JOIN daily_financials f ON f.run_id = o.run_id AND f.day = o.day_placed
    WHERE o.run_id = ? AND (o.cost > o.cash_before + ? OR o.cash_before > f.opening_cash + f.sales_revenue + ? OR o.cash_after < -?)`).get(runId, EPS, EPS, EPS).n;
  const negativeCash = db.prepare('SELECT COUNT(*) AS n FROM daily_financials WHERE run_id = ? AND closing_cash < 0').get(runId).n;
  const finalOrders = db.prepare('SELECT COUNT(*) AS n FROM replenishment_orders WHERE run_id = ? AND day_placed >= 60').get(runId).n;

  const ok = near(expected, finalCash?.closing_cash) && near(orderSpend, flow.spend) && brokenDays.length === 0
    && brokenChain.length === 0 && overspent === 0 && negativeCash === 0 && finalOrders === 0;
  return {
    opening: run.opening_cash,
    sales: flow.sales,
    replenishment: flow.spend,
    order_records_total: orderSpend,
    expected_closing: expected,
    actual_closing: finalCash?.closing_cash ?? null,
    days_with_cash_mismatch: brokenDays.map((d) => d.day),
    broken_day_to_day_links: brokenChain.map((d) => d.day),
    orders_exceeding_available_cash: overspent,
    negative_cash_days: negativeCash,
    orders_after_day_60: finalOrders,
    status: status(ok),
  };
}

function buildAssurance(db, runId, run) {
  const history_completeness = historyCompleteness(db, runId, run);
  const inventory_reconciliation = inventoryReconciliation(db, runId);
  const revenue_reconciliation = revenueReconciliation(db, runId);
  const cash_reconciliation = cashReconciliation(db, runId, run);

  const exceptions = [];
  if (history_completeness.status === 'FAIL') exceptions.push({ area: 'History completeness', message: `${history_completeness.days_retained}/60 days retained` });
  inventory_reconciliation.failures.forEach((f) => exceptions.push({ area: 'Inventory', message: `${f.name}: ${f.issue}` }));
  if (inventory_reconciliation.negative_stock_events) exceptions.push({ area: 'Inventory', message: `${inventory_reconciliation.negative_stock_events} negative stock readings` });
  if (inventory_reconciliation.overselling_events) exceptions.push({ area: 'Inventory', message: `${inventory_reconciliation.overselling_events} overselling events` });
  if (inventory_reconciliation.expired_product_sales) exceptions.push({ area: 'Inventory', message: `${inventory_reconciliation.expired_product_sales} sales of expired stock` });
  if (revenue_reconciliation.status === 'FAIL') exceptions.push({ area: 'Revenue', message: 'Daily, transaction and line-item revenue do not agree' });
  if (cash_reconciliation.status === 'FAIL') exceptions.push({ area: 'Cash', message: 'Cash movements do not reconcile or an order exceeded available cash' });

  return {
    overall_status: status(exceptions.length === 0),
    history_completeness,
    inventory_reconciliation,
    revenue_reconciliation,
    cash_reconciliation,
    exceptions,
    note: 'Stockouts, slow movers, write-offs and cash constraints are business outcomes and are not integrity failures.',
  };
}

module.exports = { buildAssurance };
