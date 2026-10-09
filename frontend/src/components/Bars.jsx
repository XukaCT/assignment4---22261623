import React from 'react';

/* Minimal dependency-free bar chart. items: [{ label, value, highlight }] */
export default function Bars({ items, height = 120, format = (v) => v }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label="Bar chart">
      {items.map((i) => (
        <div
          key={i.label}
          title={`${i.label}: ${format(i.value)}`}
          className={i.highlight ? 'bg-ticket ring-1 ring-ink' : 'bg-ink'}
          style={{ height: `${(i.value / max) * 100}%`, minHeight: 2, flex: 1 }}
        />
      ))}
    </div>
  );
}
