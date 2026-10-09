import React from 'react';

/* ---------- formatters ---------- */

const fmt = (n, min, max) =>
  Number(n ?? 0).toLocaleString('en-AU', { minimumFractionDigits: min, maximumFractionDigits: max });

export const money = (n) => `A$${fmt(n, 2, 2)}`;
export const num = (n, digits = 0) => fmt(n, digits, digits);

export const humanise = (s = '') => {
  const t = String(s).replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ---------- price figure: big dollars, small cents, like a shelf ticket ---------- */

export function Price({ amount, className = '' }) {
  const s = fmt(amount, 2, 2);
  const i = s.lastIndexOf('.');
  const dollars = s.slice(0, i);
  const cents = s.slice(i + 1);
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="sr-only">{money(amount)}</span>
      <span aria-hidden="true">
        <span className="align-top text-[0.45em] leading-[1.7]">A$</span>
        {dollars}
        <span className="align-top text-[0.45em] leading-[1.7]">{cents}</span>
      </span>
    </span>
  );
}

/* The headline number: a shelf-edge price ticket */
export function Ticket({ label, amount }) {
  return (
    <div className="ticket-print w-fit border-b-4 border-ink bg-ticket px-6 pb-3 pt-4 text-ink">
      <p className="font-semibold">{label}</p>
      <p className="display mt-1 text-6xl md:text-7xl">
        <Price amount={amount} />
      </p>
    </div>
  );
}

/* ---------- headings ---------- */

export function PageTitle({ title, sub, children }) {
  return (
    <header className="mb-2 flex flex-col gap-8 border-b-4 border-ink pb-7 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="display text-5xl md:text-7xl">{title}</h1>
        {sub && <p className="mt-4 max-w-md text-muted">{sub}</p>}
      </div>
      {children}
    </header>
  );
}

export function SectionHead({ children }) {
  return <h2 className="display mb-6 mt-14 text-3xl md:text-4xl">{children}</h2>;
}

export function SubHead({ children }) {
  return <h3 className="display mb-3 text-xl md:text-2xl">{children}</h3>;
}

/* ---------- receipt line: label ........ value ---------- */

export function Leader({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <dt className="shrink-0">{label}</dt>
      <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-[0.2em] border-b-2 border-dotted border-muted/40" />
      <dd className={`shrink-0 font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

/* ---------- accounting sum with a double underline ---------- */

export function LedgerSum({ rows, totalLabel, total }) {
  return (
    <dl className="w-full max-w-lg">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 border-b border-rule py-2.5">
          <dt>{r.label}</dt>
          <dd className={`tabular-nums ${r.tone ?? ''}`}>
            <span className="inline-block w-4">{r.sign ?? ''}</span>
            {money(r.value)}
          </dd>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 border-b-4 border-double border-ink py-3">
        <dt className="display text-xl">{totalLabel}</dt>
        <dd className="display text-3xl tabular-nums">{money(total)}</dd>
      </div>
    </dl>
  );
}

/* ---------- audit stamp ---------- */

export function Stamp({ status }) {
  const map = {
    PASS: ['Pass', 'border-gain text-gain'],
    FAIL: ['Fail', 'border-loss text-loss'],
  };
  const [text, cls] = map[status] ?? ['No data', 'border-muted text-muted'];
  return <span className={`display inline-block shrink-0 border-[3px] px-3 py-0.5 text-2xl ${cls}`}>{text}</span>;
}

/* ---------- states ---------- */

export function LoadingState({ message = 'Loading…' }) {
  return (
    <div role="status" className="py-24">
      <p className="display text-3xl">{message}</p>
      <div className="mt-5 h-1.5 w-56 overflow-hidden bg-rule">
        <div className="sweep h-full w-1/3 bg-ink" />
      </div>
    </div>
  );
}

export function ErrorState({ message = 'Something went wrong loading this data.', onRetry }) {
  return (
    <div role="alert" className="border-l-8 border-loss bg-loss-tint px-6 py-6 text-loss">
      <p className="display text-2xl">{message}</p>
      <p className="mt-1 text-ink">Check that the server is running, then try again.</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-4 bg-ink px-5 py-2.5 font-semibold text-paper hover:bg-loss">
          Try again
        </button>
      )}
    </div>
  );
}