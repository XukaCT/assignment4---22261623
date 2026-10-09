// Autonomous Store Brain: a pure, rule-based reviewer.
// Input is a closing-state snapshot; output is a list of events and replenishment orders.


const STATE = { OK: 'ok', LOW: 'low_stock', SOLD_OUT: 'sold_out', SLOW: 'slow_moving' };

function reorderPoint(item, brain, leadTime) {
  const safety = item.isPerishable ? brain.safetyDaysPerishable : brain.safetyDays;
  return Math.ceil(item.rate * (leadTime + safety));
}

function classify(item, brain, leadTime, day) {
  if (item.onHand <= 0) return STATE.SOLD_OUT;
  const slowHistoryOk = day >= brain.slowMinHistoryDays;
  if (slowHistoryOk && (item.avgDaily === 0 || item.onHand / item.avgDaily > brain.slowCoverDays)) return STATE.SLOW;
  if (item.rate > 0 && item.onHand <= reorderPoint(item, brain, leadTime)) return STATE.LOW;
  return STATE.OK;
}

// Units in near-expiry batches that will probably not sell before the batch expires.
function unitsAtRisk(item, brain) {
  let risk = 0;
  for (const b of item.batches) {
    if (b.daysToExpiry <= brain.expiryWarningDays) {
      const sellableBeforeExpiry = Math.floor(item.avgDaily * Math.max(b.daysToExpiry - 1, 0));
      risk += Math.max(0, b.qty - sellableBeforeExpiry);
    }
  }
  return Math.min(risk, item.onHand);
}

/**
 * @param {object} ctx  { day, finalDay, cash, params, items }
 * items[]: { id, name, onHand, avgDaily, lifetimeRate, isPerishable, shelfLife, unitCost, unitPrice,
 *            prevState, batches:[{ batchDay, qty, daysToExpiry }], warnedBatches:Set }
 *   daysToExpiry = trading days until the batch is removed at the start of a day (1 = gone tomorrow morning).
 * @returns {{ events, orders, states, spent }}
 */
function review({ day, finalDay, cash, params, leadTime, items }) {
  const brain = params.brain;
  const events = [];
  const candidates = [];
  const states = new Map();

  for (const item of items) {
    item.rate = item.avgDaily > 0 ? item.avgDaily : item.lifetimeRate;
    const state = classify(item, brain, leadTime, day);
    states.set(item.id, state);

    // Condition detection (logged when a product enters a state)
    if (state !== item.prevState) {
      const rop = reorderPoint(item, brain, leadTime);
      if (state === STATE.SOLD_OUT) {
        events.push({ productId: item.id, type: 'sold_out', detail: `Closed with 0 units; 7-day average demand ${item.avgDaily.toFixed(1)}/day.` });
      } else if (state === STATE.LOW) {
        events.push({ productId: item.id, type: 'low_stock', qty: item.onHand, detail: `On hand ${item.onHand} <= reorder point ${rop} (demand ${item.rate.toFixed(1)}/day x ${leadTime + (item.isPerishable ? brain.safetyDaysPerishable : brain.safetyDays)} days).` });
      } else if (state === STATE.SLOW) {
        const cover = item.avgDaily > 0 ? `${(item.onHand / item.avgDaily).toFixed(0)} days of cover` : 'no sales in the window';
        events.push({ productId: item.id, type: 'slow_moving', qty: item.onHand, cost: item.onHand * item.unitCost, detail: `${item.onHand} units on hand with ${cover}; replenishment suspended.` });
      }
    }

    // Expiry watch (once per batch)
    if (item.isPerishable) {
      for (const b of item.batches) {
        if (b.daysToExpiry <= brain.expiryWarningDays && b.qty > 0 && !item.warnedBatches.has(b.batchDay)) {
          item.warnedBatches.add(b.batchDay);
          events.push({ productId: item.id, type: 'expiry_warning', qty: b.qty, cost: b.qty * item.unitCost, detail: `Batch received day ${b.batchDay} is removed from sale in ${b.daysToExpiry} day(s); reorder quantity is reduced for units at risk.` });
        }
      }
    }

    // Replenishment decision
    if (day >= finalDay || state === STATE.SLOW || item.rate <= 0) continue;
    const effective = item.onHand - unitsAtRisk(item, brain);
    if (effective > reorderPoint(item, brain, leadTime)) continue;

    const cover = item.isPerishable ? Math.max(1, Math.min(brain.targetCoverDays, item.shelfLife - 1)) : brain.targetCoverDays;
    const target = Math.ceil(item.rate * (leadTime + cover));
    const qty = Math.max(1, target - effective);
    candidates.push({
      item,
      state,
      qty,
      cover: item.avgDaily > 0 ? item.onHand / item.avgDaily : 0,
      margin: (item.unitPrice - item.unitCost) / item.unitPrice,
      detail: `Order up to ${target} units (${cover} days cover after ${leadTime}-day lead time); effective stock ${effective}.`,
    });
  }

  // Under a cash constraint, serve the most urgent products first.
  candidates.sort((a, b) => {
    const aOut = a.state === STATE.SOLD_OUT ? 0 : 1;
    const bOut = b.state === STATE.SOLD_OUT ? 0 : 1;
    return aOut - bOut || a.cover - b.cover || b.margin - a.margin;
  });

  const orders = [];
  let remaining = cash;
  for (const c of candidates) {
    const { item } = c;
    const affordable = Math.floor((remaining + 1e-9) / item.unitCost);
    const qty = Math.min(c.qty, affordable);

    if (qty < c.qty) {
      const short = c.qty - qty;
      events.push({ productId: item.id, type: 'cash_constrained', qty: short, cost: short * item.unitCost, detail: `Wanted ${c.qty}, could afford ${qty} with A$${remaining.toFixed(2)} available.` });
    }
    if (qty < 1) continue;

    const cost = Number((qty * item.unitCost).toFixed(2));
    orders.push({ productId: item.id, qty, cost, cashBefore: Number(remaining.toFixed(2)), cashAfter: Number((remaining - cost).toFixed(2)), reason: c.detail });
    events.push({ productId: item.id, type: 'replenishment_ordered', qty, cost, detail: c.detail });
    remaining -= cost;
  }

  return { events, orders, states, spent: Number((cash - remaining).toFixed(2)) };
}

module.exports = { review, STATE };
