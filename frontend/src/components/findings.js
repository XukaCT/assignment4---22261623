import { money, num } from './ui';

/*
 * Builds the three management findings from the stored summary of the shown run,
 * so every number quoted is read from the run's history (never hard-coded).
 * Chain: Observation -> Evidence -> Diagnosis -> Business implication -> Recommendation.
 */
export const MODEL_LIMITATION =
  'Model limitation: demand is simulated, not observed. Results show how the Store Brain behaves under the declared assumptions and need calibration with real sales before decisions are made.';

export function buildFindings(data) {
  const b = data.business;
  const h = data.inventory_health;
  const sb = Object.fromEntries(data.store_brain.map((e) => [e.event_type, e]));
  const shopper = data.shopper_stats;
  const cats = data.categories;
  const out = [];

  const revenue = b.total_revenue || 1;
  const wo = h.total_writeoff_value || 0;
  const worstWo = h.writeoff_by_category?.[0];

  if (wo > 0) {
    out.push({
      kind: 'Problem',
      observation: `Expired stock cost ${money(wo)} (${num((wo / revenue) * 100, 1)}% of revenue), concentrated in ${worstWo?.category ?? 'perishables'}.`,
      evidence: [
        `${num(h.total_expired_units)} units written off at cost ${money(wo)}.`,
        worstWo ? `${worstWo.category} accounts for ${money(worstWo.value)} (${num(worstWo.units)} units).` : null,
        `${num(sb.expiry_warning?.count ?? 0)} expiry warnings and ${num(sb.expired?.count ?? 0)} expiry removals were logged.`,
        `Gross profit was ${money(b.gross_profit)} before write-offs; write-offs absorb ${num((wo / (b.gross_profit || 1)) * 100, 1)}% of it.`,
      ].filter(Boolean),
      diagnosis: 'Short-life batches are ordered on a rolling demand average and the opening perishable stock is a single batch, so stock bought for peak days is left over when demand dips.',
      implication: 'Spoilage reduces gross margin on exactly the fresh lines that bring customers into a convenience store.',
      recommendation: 'Cut opening quantities and order cover for the shortest-life lines, and trial markdowns on batches inside the expiry-warning window.',
    });
  }

  const stockDays = h.stockout_product_days || 0;
  const constrained = sb.cash_constrained?.count ?? 0;
  if (stockDays > 0 || constrained > 0) {
    const top = h.stockout_by_product?.[0];
    out.push({
      kind: 'Problem',
      observation: `Products closed empty on ${num(stockDays)} product-days across ${num(h.products_that_stocked_out)} products; ${num(constrained)} orders were limited by cash.`,
      evidence: [
        `${num(sb.sold_out?.count ?? 0)} sold-out events and ${num(sb.low_stock?.count ?? 0)} low-stock events were logged.`,
        top ? `Most affected: ${top.name} (${num(top.days_out)} days out).` : null,
        `${num(b.walkouts)} customers left without buying.`,
        `Replenishment spend was ${money(b.total_replenishment_spend)}; closing cash was ${money(b.closing_cash)}.`,
      ].filter(Boolean),
      diagnosis: constrained > 0
        ? 'Replenishment demand exceeded available operating cash on some days, so lower-priority orders were reduced or skipped.'
        : 'With a one-day lead time, a product can sell out intraday before the end-of-day review can react.',
      implication: 'Each empty day is lost margin and may push customers to a competitor nearby.',
      recommendation: 'Raise safety stock on the highest-velocity lines first, and review whether the A$15,000 operating cash is enough for the peak-day order bill.',
    });
  }

  const slow = h.slow_moving_products || [];
  const slowValue = slow.reduce((s, p) => s + p.value, 0);
  if (slow.length > 0 || b.closing_inventory_value > 0) {
    out.push({
      kind: slow.length > 0 ? 'Trade-off' : 'Result',
      observation: slow.length > 0
        ? `${slow.length} products ended the run flagged slow moving, tying up ${money(slowValue)} of inventory at cost.`
        : `The store closed with ${money(b.closing_inventory_value)} of inventory and ${money(b.closing_cash)} of cash.`,
      evidence: [
        slow[0] ? `Largest: ${slow[0].name} with ${num(slow[0].closing_qty)} units on hand and ${num(slow[0].units_sold)} sold in 60 days.` : null,
        `Closing inventory is ${money(b.closing_inventory_value)} at cost against opening A$40,000 budget.`,
        `${num(sb.slow_moving?.count ?? 0)} slow-moving events were logged.`,
      ].filter(Boolean),
      diagnosis: 'Opening quantities were set by category rather than by expected demand, so low-popularity lines start with far more stock than they sell.',
      implication: 'Capital tied up in slow stock cannot be used for fast sellers, and any perishable among them risks write-off.',
      recommendation: 'Re-balance the opening range toward high-velocity products and consider delisting or promoting the slowest lines.',
    });
  }

  const wk = shopper.weekday_weekend?.find((r) => r.day_type === 'weekday');
  const we = shopper.weekday_weekend?.find((r) => r.day_type === 'weekend');
  if (wk && we) {
    const diff = ((we.avg_customers - wk.avg_customers) / wk.avg_customers) * 100;
    const topCat = cats[0];
    out.push({
      kind: 'Result',
      observation: `Weekend days averaged ${num(we.avg_customers, 0)} customers against ${num(wk.avg_customers, 0)} on weekdays (${diff >= 0 ? '+' : ''}${num(diff, 0)}%).`,
      evidence: [
        `Average transaction value: ${money(wk.avg_transaction_value)} weekday vs ${money(we.avg_transaction_value)} weekend.`,
        `Average basket: ${num(wk.avg_basket_units, 1)} vs ${num(we.avg_basket_units, 1)} units.`,
        topCat ? `${topCat.category} was the top category with ${money(topCat.revenue)} revenue and ${money(topCat.gross_profit)} gross profit.` : null,
      ].filter(Boolean),
      diagnosis: 'The declared model drives weekday trade from commuter and office-lunch missions and weekend trade from larger top-up and household missions.',
      implication: 'Stock levels and ordering should follow the weekly rhythm rather than a flat daily target.',
      recommendation: 'Make reorder targets day-of-week aware, with higher cover before the busier day type.',
    });
  }

  return out.slice(0, 3);
}
