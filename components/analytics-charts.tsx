'use client';

// Dependency-free SVG charts for the analytics page.

const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/** Vertical bars, one per day. */
export function BarsChart({ points, color = '#0ea5e9' }: {
  points: { date: string; count: number }[];
  color?: string;
}) {
  const W = 640, H = 200, padL = 30, padB = 26, padT = 12;
  const innerW = W - padL - 6, innerH = H - padB - padT;
  const max = Math.max(...points.map((p) => p.count), 1);
  const n = points.length;
  const gap = n > 40 ? 1 : 3;
  const bw = Math.max(2, innerW / n - gap);
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="area-chart" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((f) => {
        const y = padT + innerH - f * innerH;
        return <line key={f} x1={padL} y1={y} x2={W} y2={y} stroke="#eef0f5" strokeWidth="1" />;
      })}
      <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" className="axis-label">0</text>
      <text x={padL - 6} y={padT + 6} textAnchor="end" className="axis-label">{max}</text>

      {points.map((p, i) => {
        const h = (p.count / max) * innerH;
        const x = padL + i * (innerW / n) + gap / 2;
        const y = padT + innerH - h;
        return (
          <g key={p.date}>
            <rect x={x} y={y} width={bw} height={Math.max(0, h)} rx={n > 40 ? 0 : 2} fill={color}>
              <title>{`${fmtDay(p.date)}: ${p.count} active`}</title>
            </rect>
            {i % labelEvery === 0 ? (
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="axis-label">{fmtDay(p.date)}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Two lines: registrations vs first-time depositors. */
export function TrendLines({ points }: { points: { date: string; registrations: number; ftd: number }[] }) {
  const W = 640, H = 220, padL = 30, padB = 26, padT = 12;
  const innerW = W - padL - 6, innerH = H - padB - padT;
  const n = points.length;
  const max = Math.max(...points.flatMap((p) => [p.registrations, p.ftd]), 1);
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const path = (key: 'registrations' | 'ftd') =>
    points
      .map((p, i) => {
        const x = padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
        const y = padT + innerH - (p[key] / max) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const dot = (key: 'registrations' | 'ftd', color: string) =>
    points.map((p, i) => {
      const x = padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = padT + innerH - (p[key] / max) * innerH;
      return (
        <circle key={`${key}-${i}`} cx={x} cy={y} r="2.6" fill="#fff" stroke={color} strokeWidth="1.8">
          <title>{`${fmtDay(p.date)} · ${p[key]} ${key === 'ftd' ? 'first deposits' : 'registrations'}`}</title>
        </circle>
      );
    });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="area-chart" preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map((f) => {
        const y = padT + innerH - f * innerH;
        return <line key={f} x1={padL} y1={y} x2={W} y2={y} stroke="#eef0f5" strokeWidth="1" />;
      })}
      <text x={padL - 6} y={padT + innerH + 3} textAnchor="end" className="axis-label">0</text>
      <text x={padL - 6} y={padT + 6} textAnchor="end" className="axis-label">{max}</text>

      <path d={path('registrations')} fill="none" stroke="#4f46e5" strokeWidth="2.4" strokeLinejoin="round" />
      <path d={path('ftd')} fill="none" stroke="#059669" strokeWidth="2.4" strokeLinejoin="round" />
      {dot('registrations', '#4f46e5')}
      {dot('ftd', '#059669')}

      {points.map((p, i) =>
        i % labelEvery === 0 || i === n - 1 ? (
          <text key={p.date} x={padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)} y={H - 8} textAnchor="middle" className="axis-label">
            {fmtDay(p.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}
