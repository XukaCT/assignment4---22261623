import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { PageTitle, SectionHead, SubHead, Leader, LoadingState, ErrorState, money, num } from './ui';

export default function Declaration({ runId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    api.getConfig(runId)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { console.error(e); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [runId, reloadKey]);

  if (error) return <ErrorState message="Couldn't load the model declaration." onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return <LoadingState message="Loading model declaration..." />;

  const { declaration: d, products } = data;
  const c = d.client_constraints;

  return (
    <div>
      <PageTitle title="Model declaration" sub={`Assumptions frozen with Run ${d.run_id} (seed ${d.seed}). Generated from the stored configuration.`} />

      <SectionHead>Client constraints</SectionHead>
      <dl className="max-w-xl">
        <Leader label="Opening inventory budget (max)" value={money(c.inventory_budget)} />
        <Leader label="Opening inventory cost" value={money(c.opening_inventory_cost)} />
        <Leader label="Opening operating cash" value={money(c.opening_cash)} />
        <Leader label="Simulation length" value={`${c.simulation_days} days`} />
        <Leader label="Replenishment lead time" value={`${c.lead_time_days} day`} />
      </dl>

      <SectionHead>Model assumptions</SectionHead>
      <div className="grid gap-x-16 gap-y-10 md:grid-cols-2">
        {d.sections.map((s) => (
          <div key={s.title}>
            <SubHead>{s.title}</SubHead>
            <ul className="list-disc space-y-2 pl-5 text-muted">
              {s.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <SectionHead>Product data ({products.length} products)</SectionHead>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-ink text-paper">
            <tr>
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 font-semibold">Product</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 text-right font-semibold">Cost</th>
              <th className="px-3 py-2 text-right font-semibold">Price</th>
              <th className="px-3 py-2 text-right font-semibold">Opening qty</th>
              <th className="px-3 py-2 text-right font-semibold">Shelf life</th>
              <th className="px-3 py-2 text-right font-semibold">Popularity</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-rule odd:bg-panel">
                <td className="px-3 py-2 tabular-nums">{p.sku || p.id}</td>
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2">{p.category}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.unit_cost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.unit_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(p.initial_qty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.is_perishable ? `${p.shelf_life_days} d` : '-'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(p.popularity, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
