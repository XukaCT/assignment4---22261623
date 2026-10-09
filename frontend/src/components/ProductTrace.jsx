import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { SubHead, LoadingState, money, num, humanise } from './ui';

/* Full audit trail for one product: daily stock, orders and Store Brain events. */
export default function ProductTrace({ runId, productId, onClose, onOpenDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    api.getProductTrace(runId, productId)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { console.error(e); if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [runId, productId]);

  return (
    <section className="mt-8 border-4 border-ink bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <SubHead>{data ? `Trace: ${data.product.name}` : 'Product trace'}</SubHead>
        <button onClick={onClose} className="font-semibold underline">Close</button>
      </div>
      {error && <p className="text-loss">Couldn't load the trace.</p>}
      {!data && !error && <LoadingState message="Loading trace..." />}
      {data && (
        <div className="grid gap-8 md:grid-cols-2">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-ink text-paper">
                <tr><th className="px-2 py-1.5">Day</th><th className="px-2 text-right">Open</th><th className="px-2 text-right">In</th><th className="px-2 text-right">Sold</th><th className="px-2 text-right">Exp.</th><th className="px-2 text-right">Close</th></tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.day} className="border-b border-rule">
                    <td className="px-2 py-1"><button className="underline" onClick={() => onOpenDay(d.day)}>{d.day}</button></td>
                    <td className="px-2 text-right tabular-nums">{d.opening_qty}</td>
                    <td className="px-2 text-right tabular-nums">{d.received}</td>
                    <td className="px-2 text-right tabular-nums">{d.sold}</td>
                    <td className="px-2 text-right tabular-nums">{d.expired}</td>
                    <td className={`px-2 text-right tabular-nums ${d.closing_qty === 0 ? 'font-semibold text-loss' : ''}`}>{d.closing_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-h-96 overflow-auto text-sm">
            <p className="mb-2 font-semibold">Store Brain events ({data.brain_events.length})</p>
            <ul className="space-y-2">
              {data.brain_events.map((e) => (
                <li key={e.id} className="border-b border-rule pb-2">
                  <span className="font-semibold">Day {e.day}: {humanise(e.event_type)}</span>
                  {e.qty ? ` (${num(e.qty)} units${e.cost ? `, ${money(e.cost)}` : ''})` : ''}
                  {e.detail && <span className="block text-muted">{e.detail}</span>}
                </li>
              ))}
              {data.brain_events.length === 0 && <li className="text-muted">No events for this product.</li>}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
