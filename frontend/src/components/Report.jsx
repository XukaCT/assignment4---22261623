import React, { useEffect, useState } from 'react';
import { api } from '../api';
import {
  PageTitle, SectionHead, SubHead, Leader, Ticket, Price, LoadingState, ErrorState, money, num, humanise,
} from './ui';
import Bars from './Bars';
import { buildFindings, MODEL_LIMITATION } from './findings';

const Th = ({ children, right }) => (
  <th className={`px-4 py-2.5 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>
);
const Td = ({ children, right, strong, className = '' }) => (
  <td className={`px-4 py-3 ${right ? 'text-right tabular-nums' : ''} ${strong ? 'font-semibold' : ''} ${className}`}>{children}</td>
);
const Table = ({ head, children, empty, cols }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[28rem] text-left">
      <thead className="bg-ink text-paper"><tr>{head}</tr></thead>
      <tbody className="[&>tr]:border-b [&>tr]:border-rule [&>tr:nth-child(odd)]:bg-panel">
        {React.Children.count(children) ? children : (
          <tr><td colSpan={cols} className="px-4 py-6 text-muted">{empty}</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

export default function Report({ runId, onOpenDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    setData(null);
    setError(false);
    api.getSummary(runId)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { console.error(e); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [runId, reloadKey]);

  if (error) return <ErrorState message="Couldn't load the 60-day report." onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <LoadingState message="Gathering 60-day insights..." />;

  const b = data.business;
  const h = data.inventory_health;
  const s = data.shopper_stats;
  const margin = b.total_revenue ? (b.gross_profit / b.total_revenue) * 100 : 0;
  const findings = buildFindings(data);
  const days = s.daily_series;

  return (
    <div>
      <PageTitle title="60-day commercial report" sub={`Run ${data.run.id}. Every figure is calculated from the stored history of this run.`}>
        <Ticket label="Total revenue" amount={b.total_revenue} />
      </PageTitle>

      {/* ---------------- Part 1 ---------------- */}
      <SectionHead>Part 1: Business performance</SectionHead>
      <div className="grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Store performance</SubHead>
          <dl>
            <Leader label="Total customers" value={num(b.total_customers)} />
            <Leader label="Total transactions" value={num(b.total_transactions)} />
            <Leader label="Units sold" value={num(b.total_units_sold)} />
            <Leader label="Sales revenue" value={money(b.total_revenue)} />
            <Leader label="Cost of goods sold" value={money(b.total_cogs)} />
            <Leader label={`Gross profit (${num(margin, 1)}%)`} value={money(b.gross_profit)} valueClass="text-gain" />
            <Leader label="Expiry write-off value" value={money(b.total_writeoff_value)} valueClass="text-loss" />
            <Leader label="Closing operating cash" value={money(b.closing_cash)} />
            <Leader label="Closing inventory value" value={money(b.closing_inventory_value)} />
          </dl>
          <p className="mt-2 text-sm text-muted">Gross profit is before write-offs; premises, rent and overheads are outside the model.</p>
        </div>

        <div>
          <SubHead>Shoppers and baskets</SubHead>
          <dl>
            <Leader label="Customers per day" value={num(s.avg_customers_per_day, 1)} />
            <Leader label="Customers who bought" value={`${num(s.conversion_rate * 100, 1)}%`} />
            <Leader label="Basket size" value={`${num(s.avg_basket_size, 2)} units`} />
            <Leader label="Average transaction value" value={money(s.avg_transaction_value)} />
          </dl>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink text-paper">
                <tr><Th>Day type</Th><Th right>Days</Th><Th right>Customers/day</Th><Th right>Avg basket</Th><Th right>Avg value</Th><Th right>Revenue/day</Th></tr>
              </thead>
              <tbody>
                {s.weekday_weekend.map((r) => (
                  <tr key={r.day_type} className="border-b border-rule">
                    <Td strong>{humanise(r.day_type)}</Td>
                    <Td right>{num(r.days)}</Td>
                    <Td right>{num(r.avg_customers, 1)}</Td>
                    <Td right>{num(r.avg_basket_units, 1)}</Td>
                    <Td right>{money(r.avg_transaction_value)}</Td>
                    <Td right>{money(r.avg_revenue)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <SubHead>Customers per day (weekends highlighted)</SubHead>
        <Bars
          items={days.map((d) => ({ label: `Day ${d.day}`, value: d.customers, highlight: d.day_type === 'weekend' }))}
          format={(v) => `${v} customers`}
        />
        <div className="mt-1 flex justify-between text-sm text-muted"><span>Day 1</span><span>Day 60</span></div>
      </div>

      <div className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Shopping missions</SubHead>
          <Table cols={4} empty="No transactions." head={<><Th>Mission</Th><Th right>Transactions</Th><Th right>Revenue</Th><Th right>Basket</Th></>}>
            {s.by_mission.map((m) => (
              <tr key={m.mission}>
                <Td strong>{humanise(m.mission)}</Td><Td right>{num(m.transactions)}</Td>
                <Td right>{money(m.revenue)}</Td><Td right>{num(m.avg_basket_units, 1)}</Td>
              </tr>
            ))}
          </Table>
        </div>
        <div>
          <SubHead>Sales by hour of day</SubHead>
          <Bars items={s.by_hour.map((r) => ({ label: `${r.hour}:00`, value: r.revenue }))} format={(v) => money(v)} />
          <div className="mt-1 flex justify-between text-sm text-muted"><span>{s.by_hour[0]?.hour}:00</span><span>{s.by_hour.at(-1)?.hour}:00</span></div>
        </div>
      </div>

      <div className="mt-12">
        <SubHead>Category performance</SubHead>
        <Table cols={5} empty="No category data." head={<><Th>Category</Th><Th right>Units sold</Th><Th right>Revenue</Th><Th right>Gross profit</Th><Th right>Margin</Th></>}>
          {data.categories.map((c) => (
            <tr key={c.category}>
              <Td strong>{c.category}</Td><Td right>{num(c.units_sold)}</Td><Td right>{money(c.revenue)}</Td>
              <Td right strong className="text-gain">{money(c.gross_profit)}</Td>
              <Td right>{c.revenue ? `${num((c.gross_profit / c.revenue) * 100, 1)}%` : '-'}</Td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
        <ProductList title="Top 5 products by revenue" items={data.top_products} />
        <ProductList title="Slowest 5 products by units" items={data.bottom_products} />
      </div>

      {/* ---------------- Part 2 ---------------- */}
      <SectionHead>Part 2: Inventory and autonomous operations</SectionHead>
      <div className="grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Inventory health</SubHead>
          <dl>
            <Leader label="Stockout events (sold out)" value={num(data.store_brain.find((e) => e.event_type === 'sold_out')?.count)} />
            <Leader label="Product-days closed empty" value={num(h.stockout_product_days)} />
            <Leader label="Low-stock events" value={num(data.store_brain.find((e) => e.event_type === 'low_stock')?.count)} />
            <Leader label="Expired units" value={num(h.total_expired_units)} valueClass="text-loss" />
            <Leader label="Write-off value" value={money(h.total_writeoff_value)} valueClass="text-loss" />
            <Leader label="Replenishment spend" value={money(b.total_replenishment_spend)} />
            <Leader label="Closing inventory" value={`${num(b.closing_inventory_units)} units / ${money(b.closing_inventory_value)}`} />
          </dl>
        </div>
        <div>
          <SubHead>Store Brain activity</SubHead>
          <dl>
            {data.store_brain.map((e) => (
              <Leader key={e.event_type} label={humanise(e.event_type)} value={num(e.count)} />
            ))}
          </dl>
          <p className="mt-2 text-sm text-muted">
            {data.store_brain.find((e) => e.event_type === 'cash_constrained')?.count
              ? 'Some replenishment was limited by operating cash (listed below).'
              : 'No replenishment was limited by operating cash.'}
          </p>
        </div>
      </div>

      <div className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Write-offs by category</SubHead>
          <Table cols={3} empty="No write-offs." head={<><Th>Category</Th><Th right>Units</Th><Th right>Value</Th></>}>
            {h.writeoff_by_category.map((r) => (
              <tr key={r.category}><Td strong>{r.category}</Td><Td right>{num(r.units)}</Td><Td right className="text-loss">{money(r.value)}</Td></tr>
            ))}
          </Table>
        </div>
        <div>
          <SubHead>Replenishment by category</SubHead>
          <Table cols={4} empty="No orders." head={<><Th>Category</Th><Th right>Orders</Th><Th right>Units</Th><Th right>Spend</Th></>}>
            {h.replenishment_by_category.map((r) => (
              <tr key={r.category}><Td strong>{r.category}</Td><Td right>{num(r.orders)}</Td><Td right>{num(r.units_ordered)}</Td><Td right>{money(r.spend)}</Td></tr>
            ))}
          </Table>
        </div>
      </div>

      <div className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
        <div>
          <SubHead>Slow-moving products at close</SubHead>
          <Table cols={3} empty="No products were flagged slow moving at close." head={<><Th>Product</Th><Th right>On hand</Th><Th right>Value</Th></>}>
            {h.slow_moving_products.map((r) => (
              <tr key={r.product_id}><Td strong>{r.name}</Td><Td right>{num(r.closing_qty)}</Td><Td right>{money(r.value)}</Td></tr>
            ))}
          </Table>
        </div>
        <div>
          <SubHead>Closing inventory by category</SubHead>
          <Table cols={3} empty="-" head={<><Th>Category</Th><Th right>Units</Th><Th right>Value (cost)</Th></>}>
            {h.closing_by_category.map((r) => (
              <tr key={r.category}><Td strong>{r.category}</Td><Td right>{num(r.units)}</Td><Td right>{money(r.value)}</Td></tr>
            ))}
          </Table>
        </div>
      </div>

      <div className="mt-12">
        <SubHead>Stockout: detected, acted on, outcome</SubHead>
        <Table cols={6} empty="No sold-out events occurred in this run (0)."
          head={<><Th>Day</Th><Th>Product</Th><Th right>Ordered</Th><Th right>Order cost</Th><Th>Outcome</Th><Th /></>}>
          {data.stockout_cases.map((c, i) => (
            <tr key={i}>
              <Td right>{c.day}</Td><Td strong>{c.name}</Td>
              <Td right>{c.ordered_qty ? num(c.ordered_qty) : 'none'}</Td>
              <Td right>{c.order_cost ? money(c.order_cost) : '-'}</Td>
              <Td>
                {c.next_day_received ? `Restocked day ${c.day + 1} (${num(c.next_day_received)} received)` : c.ordered_qty ? 'Order pending' : 'No order placed'}
                {c.next_day_state === 'sold_out' ? ', sold out again' : ''}
              </Td>
              <Td right><button className="font-semibold underline" onClick={() => onOpenDay(c.day)}>Day {c.day}</button></Td>
            </tr>
          ))}
        </Table>
      </div>

      {data.cash_constrained_cases.length > 0 && (
        <div className="mt-12">
          <SubHead>Cash-constrained orders</SubHead>
          <Table cols={4} empty="" head={<><Th>Day</Th><Th>Product</Th><Th right>Units not ordered</Th><Th>Detail</Th></>}>
            {data.cash_constrained_cases.map((c, i) => (
              <tr key={i}><Td right>{c.day}</Td><Td strong>{c.name}</Td><Td right>{num(c.units_not_ordered)}</Td><Td className="text-muted">{c.detail}</Td></tr>
            ))}
          </Table>
        </div>
      )}

      {/* ---------------- Part 3 ---------------- */}
      <SectionHead>Part 3: Diagnosis and next steps</SectionHead>
      <div className="grid gap-12">
        {findings.map((f, i) => <Finding key={i} n={i + 1} {...f} />)}
      </div>
      <p className="mt-8 max-w-3xl text-sm text-muted">{MODEL_LIMITATION}</p>
    </div>
  );
}

const ProductList = ({ title, items }) => (
  <div>
    <SubHead>{title}</SubHead>
    {items?.length ? (
      <ol>
        {items.map((p, i) => (
          <li key={p.product_id} className="flex items-baseline gap-3 border-b border-rule py-2.5">
            <span className="display w-6 shrink-0 text-xl text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1">{p.name}</span>
            <span className="shrink-0 text-right">
              <span className="font-semibold tabular-nums"><Price amount={p.revenue} /></span>
              <span className="block text-sm tabular-nums text-muted">{num(p.units_sold)} units</span>
            </span>
          </li>
        ))}
      </ol>
    ) : <p className="text-muted">No products to show.</p>}
  </div>
);

const Finding = ({ n, kind, observation, evidence, diagnosis, implication, recommendation }) => (
  <article className="border-t-4 border-ink pt-5">
    <p className="text-sm font-semibold text-muted">Finding {n} ({kind})</p>
    <h3 className="display max-w-3xl text-2xl md:text-3xl">{observation}</h3>
    <dl className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-[8rem_1fr]">
      <dt className="font-semibold">Evidence</dt>
      <dd className="max-w-2xl text-muted"><ul className="list-disc space-y-1 pl-5">{evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></dd>
      <dt className="font-semibold">Diagnosis</dt><dd className="max-w-2xl text-muted">{diagnosis}</dd>
      <dt className="font-semibold">Implication</dt><dd className="max-w-2xl text-muted">{implication}</dd>
    </dl>
    <p className="mt-5 max-w-3xl bg-ticket px-4 py-3 font-semibold"><span className="display mr-2 text-lg">Action</span>{recommendation}</p>
  </article>
);
