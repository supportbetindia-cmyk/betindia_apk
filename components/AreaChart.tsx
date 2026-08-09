import type { DayPoint } from '@/lib/metrics';

/** Dependency-free SVG area chart with axis labels and hover dots. */
export function AreaChart({ points, color = '#7c6cf6' }: { points: DayPoint[]; color?: string }) {
  const W = 560;
  const H = 220;
  const padL = 34;
  const padB = 24;
  const padT = 12;
  const innerW = W - padL;
  const innerH = H - padB - padT;

  const max = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;
  const labelEvery = Math.max(1, Math.ceil(n / 7));

  const xy = points.map((p, i) => {
    const x = padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + innerH - (p.value / max) * innerH;
    return [x, y] as const;
  });

  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${padL + innerW},${padT + innerH} L${padL},${padT + innerH} Z`;
  const id = `grad-${color.replace('#', '')}`;

  // 3 horizontal gridlines
  const grid = [0, 0.5, 1].map((f) => padT + innerH - f * innerH);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="area-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {grid.map((y, i) => (
        <line key={i} x1={padL} y1={y} x2={W} y2={y} stroke="#eef0f5" strokeWidth="1" />
      ))}
      <text x={padL - 8} y={grid[0] + 3} textAnchor="end" className="axis-label">0</text>
      <text x={padL - 8} y={grid[2] + 3} textAnchor="end" className="axis-label">{max}</text>

      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />

      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
      ))}

      {points.map((p, i) => (
        i % labelEvery === 0 || i === points.length - 1 ? (
          <text key={i} x={xy[i][0]} y={H - 6} textAnchor="middle" className="axis-label">
            {p.label}
          </text>
        ) : null
      ))}
    </svg>
  );
}
