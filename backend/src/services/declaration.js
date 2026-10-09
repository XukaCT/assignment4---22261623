// Builds the Model Declaration from the configuration frozen with the run,
// so the declared assumptions can never drift from what was simulated.

const pct = (x) => `${Math.round(x * 100)}%`;
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildDeclaration(run, products) {
  const cfg = JSON.parse(run.config_json);
  const c = cfg.customers;
  const b = cfg.brain;
  const perishables = products.filter((p) => p.is_perishable);
  const shelfLives = perishables.map((p) => p.shelf_life_days);

  return {
    run_id: run.id,
    run_name: run.run_name,
    seed: run.seed,
    client_constraints: {
      opening_cash: run.opening_cash,
      inventory_budget: run.inventory_budget,
      opening_inventory_cost: cfg.openingInventoryCost,
      simulation_days: cfg.client.simDays,
      lead_time_days: cfg.client.leadTimeDays,
    },
    sections: [
      {
        title: 'Customer activity',
        points: [
          `Daily customers are drawn around a weekday mean (${dayNames.map((d, i) => `${d} ${c.baseByWeekday[i]}`).join(', ')}) with ${pct(c.dailyNoiseSigma)} random day-to-day variation. Day 1 is a ${cfg.client.firstDayWeekday}.`,
          `Arrival hour follows separate weekday and weekend profiles from ${c.openHour}:00 to 23:00 (weekday peaks at the morning commute, lunch and after work).`,
          'A customer who finds nothing they want leaves without a transaction (a walk-out) and is counted as a customer but not a transaction.',
        ],
      },
      {
        title: 'Shopping behaviour and demand',
        points: [
          `Each customer has one of ${Object.keys(cfg.missions).length} missions: ${Object.values(cfg.missions).map((m) => `${m.label} (basket ~${m.basketMean} products)`).join('; ')}.`,
          'Mission mix changes by time band and by weekday/weekend. Each mission has category affinities that bias which products enter the basket.',
          `Every product has a popularity weight drawn once per run (log-normal, sigma ${cfg.product.popularitySigma}) and adjusted for price (cheaper items sell more). Demand is therefore product-specific, not uniform.`,
          `Cheap items (under A$${cfg.product.multiUnitPriceLimit}) are bought in a quantity of 2 with probability ${pct(cfg.product.multiUnitProbability)}; otherwise quantity is 1. Customers can only buy units in stock.`,
        ],
      },
      {
        title: 'Products and perishability',
        points: [
          `${products.length} products, ${perishables.length} perishable${shelfLives.length ? ` (shelf life ${Math.min(...shelfLives)}-${Math.max(...shelfLives)} days)` : ''}.`,
          'Stock is tracked in dated batches. Sales use FIFO (oldest batch first). A batch is removed from sale at the start of the day when its age reaches the shelf life, and the write-off is recorded at cost.',
          'Opening perishable stock is treated as received on Day 1. Non-perishables never expire.',
        ],
      },
      {
        title: 'Store Brain detection rules',
        points: [
          `Demand rate = average daily units sold over the last ${b.demandWindowDays} days.`,
          `Sold out: closing stock is 0. Low stock: stock is at or below the reorder point = demand rate x (${cfg.client.leadTimeDays}-day lead time + ${b.safetyDays} safety days; ${b.safetyDaysPerishable} for perishables).`,
          `Expiry warning: a perishable batch will be removed within ${b.expiryWarningDays} days. Units unlikely to sell before then are excluded from the stock used for reordering.`,
          `Slow moving (from day ${b.slowMinHistoryDays}): stock exceeds ${b.slowCoverDays} days of demand, or nothing sold in the window. Replenishment is suspended while a product is slow moving.`,
          'Events are logged when a product enters a state, not every day it stays in it.',
        ],
      },
      {
        title: 'Replenishment under the cash constraint',
        points: [
          `At close of each day (not Day ${cfg.client.simDays}), products at or below the reorder point are ordered up to demand x (${cfg.client.leadTimeDays} + ${b.targetCoverDays}) days of cover (perishables are capped at shelf life minus 1 day).`,
          `Orders are cash-paid when placed and arrive before customers the next day (${cfg.client.leadTimeDays}-day lead time).`,
          'When cash is short, orders are prioritised: sold-out products first, then lowest days of cover, then highest margin. An order that cannot be fully afforded is reduced to what cash allows and a cash_constrained event is logged.',
        ],
      },
      {
        title: 'Other material assumptions',
        points: [
          'Premises, rent, fit-out, refrigeration, utilities, insurance, hardware and overhead are outside the model, so gross profit is not net profit.',
          'Suppliers always deliver in full and on time; there are no price changes, markdowns, theft or customer substitution.',
          'The Store Brain bases demand on past sales, which understates true demand when a product is sold out.',
          'No real operating data exists; all results are indicative and need calibration against real sales.',
        ],
      },
    ],
  };
}

module.exports = { buildDeclaration };
