import type { Slice } from '@/lib/metrics';

/** SVG donut chart with a centered total and a legend. */
export function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 60;
  const STROKE = 22;
  const C = 2 * Math.PI * R;

  let offset = 0;
  const segments = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const seg = { color: s.color, dash: frac * C, gap: C - frac * C, offset };
    offset -= frac * C;
    return seg;
  });

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#eef0f5" strokeWidth={STROKE} />
        {total > 0 &&
          segments.map((seg, i) => (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${seg.dash} ${seg.gap}`}
              strokeDashoffset={seg.offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          ))}
        <text x="80" y="74" textAnchor="middle" className="donut-total">
          {total.toLocaleString()}
        </text>
        <text x="80" y="92" textAnchor="middle" className="donut-sub">
          {centerLabel}
        </text>
      </svg>

      <div className="donut-legend">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
          return (
            <div className="legend-row" key={s.label}>
              <span className="legend-dot" style={{ background: s.color }} />
              <span className="legend-label">{s.label}</span>
              <span className="legend-val">
                {pct}% <span className="legend-count">({s.value.toLocaleString()})</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
