'use client';

export type PeriodOption = { key: string; label: string };

/** Row of period buttons shared by the Overview and Profit pages. */
export function PeriodTabs({
  value, onChange, options,
}: {
  value: string;
  onChange: (key: string) => void;
  options: PeriodOption[];
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              border: active ? '2px solid #4f46e5' : '1px solid #e2e8f0',
              background: active ? '#eef2ff' : '#fff', color: active ? '#4f46e5' : '#475569',
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}
