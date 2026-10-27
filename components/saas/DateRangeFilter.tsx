'use client';

import { useState } from 'react';
import { CalendarDays, ChevronDown, RotateCcw } from 'lucide-react';
import { PRESETS, type RangePreset, type ResolvedRange } from '@/lib/console-range';

/** Shared date-range filter for the SaaS console. Drive it from useDateRange(). */
export function DateRangeFilter({ range, preset, onSet, onReset, isDefault }: {
  range: ResolvedRange;
  preset: RangePreset;
  onSet: (preset: RangePreset, from?: string, to?: string) => void;
  onReset: () => void;
  isDefault?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.customFrom ?? '');
  const [to, setTo] = useState(range.customTo ?? '');
  const invalid = Boolean(from && to && from > to);

  const choose = (p: RangePreset) => {
    if (p === 'custom') return; // handled by the Apply button
    onSet(p);
    setOpen(false);
  };
  const applyCustom = () => {
    if (!from || !to || invalid) return;
    onSet('custom', from, to);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          borderRadius: 8, border: '1px solid #d7dded', background: '#fff', cursor: 'pointer',
          fontWeight: 600, fontSize: 13, color: '#334155',
        }}
      >
        <CalendarDays size={15} />
        <span>{range.label}</span>
        <ChevronDown size={14} color="#94a3b8" />
      </button>

      {open ? (
        <>
          {/* click-away backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            boxShadow: '0 16px 40px rgba(15,23,42,0.14)', padding: 12, width: 320,
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PRESETS.filter((p) => p.key !== 'custom').map((p) => {
                const active = preset === p.key;
                return (
                  <button key={p.key} onClick={() => choose(p.key)} style={{
                    padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    textAlign: 'left', border: active ? '1.5px solid #4f46e5' : '1px solid #eef2f7',
                    background: active ? '#eef2ff' : '#fff', color: active ? '#4f46e5' : '#475569',
                  }}>{p.label}</button>
                );
              })}
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eef2f7' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Custom range</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)}
                  style={inputStyle} aria-label="Start date" />
                <span style={{ color: '#94a3b8' }}>→</span>
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)}
                  style={inputStyle} aria-label="End date" />
              </div>
              {invalid ? <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 6 }}>Start date must be before end date.</div> : null}
              <button onClick={applyCustom} disabled={!from || !to || invalid} style={{
                marginTop: 8, width: '100%', padding: '8px', borderRadius: 8, border: 0, cursor: (!from || !to || invalid) ? 'not-allowed' : 'pointer',
                background: (!from || !to || invalid) ? '#e2e8f0' : '#4f46e5', color: (!from || !to || invalid) ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: 13,
              }}>Apply custom range</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>Times shown in IST (Asia/Kolkata)</span>
              {!isDefault ? (
                <button onClick={() => { onReset(); setFrom(''); setTo(''); setOpen(false); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <RotateCcw size={13} /> Reset
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '7px 8px', border: '1px solid #d7dded', borderRadius: 8, fontSize: 13, minWidth: 0,
};
