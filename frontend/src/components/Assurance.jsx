import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { PageTitle, Leader, LedgerSum, Stamp, LoadingState, ErrorState, money, num } from './ui';

export default function Assurance({ runId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    api.getAssurance(runId)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { console.error(e); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [runId, reloadKey]);

  if (error) return <ErrorState message="Couldn't run the integrity audit." onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <LoadingState message="Running integrity audit..." />;

  const hc = data.history_completeness;
  const inv = data.inventory_reconciliation;
  const rev = data.revenue_reconciliation;
  const cash = data.cash_reconciliation;
  const checks = [hc.status, inv.status, rev.status, cash.status];
  const passed = checks.filter((s) => s === 'PASS').length;

  return (
    <div>
      <PageTitle title="Commercial assurance" sub="Every check below is recalculated from the stored history each time this page loads.">
        <div className="text-right">
          <Stamp status={data.overall_status} />
          <p className={`mt-1 font-semibold ${passed === checks.length ? 'text-gain' : 'text-loss'}`}>{passed} of {checks.length} checks passed</p>
        </div>
      </PageTitle>

      <Check title="History completeness" status={hc.status}>
        <p className="max-w-xl text-muted">Confirms the Submitted Run is complete and its audit records are retained.</p>
        <dl className="mt-4 max-w-lg">
          <Leader label="Run ID" value={hc.run_id} />
          <Leader label="Days retained" value={`${hc.days_retained} / ${hc.days_expected}`} />
          <Leader label="Transactions" value={num(hc.records.transactions)} />
          <Leader label="Transaction line items" value={num(hc.records.transaction_items)} />
          <Leader label="Inventory ledger entries" value={num(hc.records.inventory_ledger_entries)} />
          <Leader label="Daily inventory snapshots" value={num(hc.records.daily_inventory_snapshots)} />
          <Leader label="Replenishment orders" value={num(hc.records.replenishment_orders)} />
          <Leader label="Store Brain events" value={num(hc.records.store_brain_events)} />
        </dl>
      </Check>

      <Check title="Inventory reconciliation" status={inv.status}>
        <p className="max-w-xl text-muted">{inv.formula}, checked for {inv.products_checked} products against the ledger, daily snapshots and transactions.</p>
        <dl className="mt-4 max-w-lg">
          <Leader label="Opening stock (units)" value={num(inv.totals.opening)} />
          <Leader label="+ Replenishment received" value={num(inv.totals.received)} valueClass="text-gain" />
          <Leader label="- Units sold" value={num(inv.totals.sold)} valueClass="text-loss" />
          <Leader label="- Units expired / written off" value={num(inv.totals.expired)} valueClass="text-loss" />
          <Leader label="= Expected closing stock" value={num(inv.totals.expected_closing)} />
          <Leader label="Recorded closing stock" value={num(inv.totals.closing)} />
        </dl>
        <dl className="mt-4 max-w-lg">
          <Leader label="Negative stock events" value={num(inv.negative_stock_events)} />
          <Leader label="Overselling events" value={num(inv.overselling_events)} />
          <Leader label="Expired-product sales" value={num(inv.expired_product_sales)} />
        </dl>
        {inv.failures.length > 0 && (
          <Alert title="Integrity mismatch detected">
            {inv.failures.slice(0, 10).map((f, i) => <li key={i}>{f.name}: {f.issue}</li>)}
          </Alert>
        )}
      </Check>

      <Check title="Revenue reconciliation" status={rev.status}>
        <p className="max-w-xl text-muted">Daily revenue must equal the sum of its transaction totals, and 60-day revenue the sum of the daily figures.</p>
        <dl className="mt-4 max-w-lg">
          <Leader label="Sum of daily revenue" value={money(rev.financial_total)} />
          <Leader label="Sum of transaction totals" value={money(rev.transaction_total)} />
          <Leader label="Sum of transaction line items" value={money(rev.line_item_total)} />
          <Leader label="Days with a mismatch" value={num(rev.days_with_mismatch.length)} />
          <Leader label="Transactions whose lines differ from total" value={num(rev.transactions_with_mismatch)} />
        </dl>
      </Check>

      <Check title="Operating-cash reconciliation" status={cash.status}>
        <p className="max-w-xl text-muted">Closing cash = opening cash + sales revenue - replenishment spending, and no order may exceed the cash available when placed.</p>
        <div className="mt-4">
          <LedgerSum
            rows={[
              { label: 'Opening cash (Day 1)', value: cash.opening },
              { label: 'Sales revenue', value: cash.sales, sign: '+', tone: 'text-gain' },
              { label: 'Replenishment spending', value: cash.replenishment, sign: '-', tone: 'text-loss' },
            ]}
            totalLabel="Closing cash (Day 60)"
            total={cash.actual_closing}
          />
        </div>
        <dl className="mt-4 max-w-lg">
          <Leader label="Expected closing cash" value={money(cash.expected_closing)} />
          <Leader label="Orders exceeding available cash" value={num(cash.orders_exceeding_available_cash)} />
          <Leader label="Days with negative cash" value={num(cash.negative_cash_days)} />
          <Leader label="Orders placed after Day 60" value={num(cash.orders_after_day_60)} />
          <Leader label="Days where cash does not roll forward" value={num(cash.broken_day_to_day_links.length + cash.days_with_cash_mismatch.length)} />
        </dl>
      </Check>

      <Check title="Exceptions" status={data.exceptions.length ? 'FAIL' : 'PASS'}>
        {data.exceptions.length === 0 ? (
          <p className="font-semibold text-gain">No integrity exceptions found.</p>
        ) : (
          <Alert title="Unresolved exceptions">
            {data.exceptions.map((e, i) => <li key={i}>{e.area}: {e.message}</li>)}
          </Alert>
        )}
        <p className="mt-4 max-w-xl text-sm text-muted">{data.note}</p>
      </Check>
    </div>
  );
}

const Alert = ({ title, children }) => (
  <div role="alert" className="mt-4 max-w-xl bg-loss-tint px-5 py-4 text-loss">
    <p className="display text-xl">{title}</p>
    <ul className="mt-1 list-disc pl-5">{children}</ul>
  </div>
);

const Check = ({ title, status, children }) => (
  <section className="border-t-4 border-ink py-7">
    <div className="mb-3 flex items-start justify-between gap-4">
      <h2 className="display text-2xl md:text-3xl">{title}</h2>
      <Stamp status={status} />
    </div>
    {children}
  </section>
);
