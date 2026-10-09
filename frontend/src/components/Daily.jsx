import React, { useEffect, useState } from 'react';
import { api } from '../api';
import {
  PageTitle, SectionHead, SubHead, Leader, LedgerSum, LoadingState, ErrorState, money, num, humanise,
} from './ui';
import Bars from './Bars';
import ProductTrace from './ProductTrace';

const DOTS = {
  replenishment_ordered: 'bg-ink',
  expired: 'bg-loss',
  sold_out: 'bg-loss',
  cash_constrained: 'bg-loss',
  low_stock: 'bg-ticket ring-1 ring-ink',
  expiry_warning: 'bg-ticket ring-1 ring-loss',
  slow_moving: 'bg-panel ring-1 ring-muted',
};

export default function Daily({ runId, day, onDayChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [txns, setTxns] = useState(null);
  const [traceId, setTraceId] = useState(null);
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setTxns(null);
    setError(false);
    api.getDailyReport(runId, day)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { console.error(e); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [runId, day, reloadKey]);

  const loadTxns = () => api.getDailyTransactions(runId, day).then((res) => setTxns(res.data));
  const go = (d) => onDayChange(Math.min(60, Math.max(1, d)));

  const selector = (
    <div className="flex items-center gap-2">
      <button onClick={() => go(day - 1)} disabled={day <= 1} className="border-2 border-ink px-3 py-2 font-semibold disabled:opacity-40">Prev</button>
      <label className="sr-only" htmlFor="day-select">Day</label>
      <select id="day-select" value={day} onChange={(e) => go(Number(e.target.value))} className="border-2 border-ink bg-paper px-3 py-2 font-semibold">
        {Array.from({ length: 60 }, (_, i) => <option key={i + 1} value={i + 1}>Day {i + 1}</option>)}
      </select>
      <button onClick={() => go(day + 1)} disabled={day >= 60} className="border-2 border-ink px-3 py-2 font-semibold disabled:opacity-40">Next</button>
    </div>
  );

  if (error) return <ErrorState message={`Couldn't load Day ${day}.`} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return (<div><PageTitle title="Daily report">{selector}</PageTitle><LoadingState message="Loading day..." /></div>);

  const f = data.financials;
  const rows = onlyActive
    ? data.inventory.filter((r) => r.received || r.sold || r.expired || r.closing_qty === 0 || r.state !== 'ok')
    : data.inventory;

  return (
    <div>
      <PageTitle title={`Day ${data.day} (${data.day_type})`} sub={`Run ${runId}. One reusable report for every simulated day.`}>
        {selector}
      </PageTitle>

      <div className="mt-8 grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Trading</SubHead>
          <dl>
            <Leader label="Customers" value={num(f.customers)} />
            <Leader label="Transactions" value={num(f.transactions)} />
            <Leader label="Walk-outs (nothing to buy)" value={num(f.walkouts)} />
            <Leader label="Units sold" value={num(f.units_sold)} />
            <Leader label="Revenue" value={money(f.sales_revenue)} />
            <Leader label="Cost of goods sold" value={money(f.cogs)} />
            <Leader label="Gross profit" value={money(f.gross_profit)} valueClass="text-gain" />
            <Leader label="Expiry write-off" value={money(f.writeoff_value)} valueClass="text-loss" />
          </dl>
        </div>
        <div>
          <SubHead>Cash</SubHead>
          <LedgerSum
            rows={[
              { label: 'Opening cash', value: f.opening_cash },
              { label: 'Sales revenue', value: f.sales_revenue, sign: '+', tone: 'text-gain' },
              { label: 'Replenishment ordered', value: f.replenishment_cost, sign: '-', tone: 'text-loss' },
            ]}
            totalLabel="Closing cash"
            total={f.closing_cash}
          />
        </div>
      </div>

      <div className="mt-10 grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Sales by hour</SubHead>
          <Bars items={data.hourly_sales.map((h) => ({ label: `${h.hour}:00`, value: h.revenue }))} format={(v) => money(v)} />
          <div className="mt-1 flex justify-between text-sm text-muted">
            <span>{data.hourly_sales[0]?.hour}:00</span><span>{data.hourly_sales.at(-1)?.hour}:00</span>
          </div>
        </div>
        <div>
          <SubHead>Top sellers</SubHead>
          <ol>
            {data.top_sellers.map((p, i) => (
              <li key={p.name} className="flex justify-between border-b border-rule py-2">
                <span>{i + 1}. {p.name}</span>
                <span className="tabular-nums">{num(p.units)} units / {money(p.revenue)}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <SectionHead>Store Brain log</SectionHead>
      {data.store_brain_actions.length === 0 ? (
        <p className="text-muted">Quiet day. No alerts or orders.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead className="bg-ink text-paper">
              <tr><th className="px-4 py-2.5">Event</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Value</th><th className="px-4 py-2.5">Reason</th></tr>
            </thead>
            <tbody>
              {data.store_brain_actions.map((a) => (
                <tr key={a.id} className="border-b border-rule odd:bg-panel align-top">
                  <td className="px-4 py-3"><span className={`mr-2 inline-block h-3 w-3 ${DOTS[a.event_type] || 'bg-muted'}`} />{humanise(a.event_type)}</td>
                  <td className="px-4 py-3"><button className="text-left font-semibold underline" onClick={() => setTraceId(a.product_id)}>{a.name}</button></td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.qty ? num(a.qty) : '-'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{a.cost ? money(a.cost) : '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted">{a.detail || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-sm text-muted">
        Orders placed at close arrive before customers on Day {data.day + 1}. {data.replenishment_orders.length} order(s) placed today
        {data.day === 60 ? ' (none are placed after Day 60).' : '.'}
      </p>

      {data.replenishment_orders.length > 0 && (
        <div className="mt-8 overflow-x-auto">
          <SubHead>Orders placed</SubHead>
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-ink text-paper">
              <tr><th className="px-3 py-2">Product</th><th className="px-3 text-right">Qty</th><th className="px-3 text-right">Cost</th><th className="px-3 text-right">Cash before</th><th className="px-3 text-right">Cash after</th><th className="px-3 text-right">Due</th></tr>
            </thead>
            <tbody>
              {data.replenishment_orders.map((o) => (
                <tr key={o.id} className="border-b border-rule">
                  <td className="px-3 py-2">{o.name}</td>
                  <td className="px-3 text-right tabular-nums">{num(o.qty)}</td>
                  <td className="px-3 text-right tabular-nums">{money(o.cost)}</td>
                  <td className="px-3 text-right tabular-nums">{money(o.cash_before)}</td>
                  <td className="px-3 text-right tabular-nums">{money(o.cash_after)}</td>
                  <td className="px-3 text-right tabular-nums">Day {o.day_due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SectionHead>Inventory movements</SectionHead>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
        Show only products with movement or an alert state
      </label>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="sticky top-0 bg-ink text-paper">
            <tr><th className="px-3 py-2">Product</th><th className="px-3">Category</th><th className="px-3 text-right">Open</th><th className="px-3 text-right">Received</th><th className="px-3 text-right">Sold</th><th className="px-3 text-right">Expired</th><th className="px-3 text-right">Close</th><th className="px-3">State</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.product_id} className="border-b border-rule odd:bg-panel">
                <td className="px-3 py-2"><button className="text-left font-semibold underline" onClick={() => setTraceId(r.product_id)}>{r.name}</button></td>
                <td className="px-3 text-muted">{r.category}</td>
                <td className="px-3 text-right tabular-nums">{r.opening_qty}</td>
                <td className="px-3 text-right tabular-nums">{r.received}</td>
                <td className="px-3 text-right tabular-nums">{r.sold}</td>
                <td className="px-3 text-right tabular-nums">{r.expired}</td>
                <td className="px-3 text-right font-semibold tabular-nums">{r.closing_qty}</td>
                <td className="px-3">{r.state === 'ok' ? '-' : humanise(r.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {traceId && <ProductTrace runId={runId} productId={traceId} onClose={() => setTraceId(null)} onOpenDay={go} />}

      <SectionHead>Transactions</SectionHead>
      {!txns ? (
        <button onClick={loadTxns} className="border-2 border-ink px-4 py-2 font-semibold hover:bg-ticket">
          Show all {num(f.transactions)} transactions for Day {data.day}
        </button>
      ) : (
        <div className="max-h-[28rem] overflow-auto text-sm">
          {txns.map((t) => (
            <div key={t.id} className="border-b border-rule py-2">
              <span className="font-semibold tabular-nums">#{t.id}</span> {t.hour}:00 {humanise(t.customer_type)} -{' '}
              <span className="tabular-nums">{money(t.total_revenue)}</span>
              <span className="block text-muted">{t.items.map((i) => `${i.qty} x ${i.name}`).join(', ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
