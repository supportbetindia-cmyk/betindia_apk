import type { Kpi } from '@/lib/metrics';
import type { CSSProperties, ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';

export function KpiCard({
  label,
  kpi,
  format = (n: number) => n.toLocaleString(),
  icon,
  color,
  comparisonLabel = 'vs previous period',
}: {
  label: string;
  kpi: Kpi;
  format?: (n: number) => string;
  icon: ReactNode;
  color: string;
  comparisonLabel?: string;
}) {
  const delta = kpi.deltaPct;
  const up = delta !== null && delta >= 0;

  return (
    <div className="kpi" style={{ '--accent': color } as CSSProperties}>
      <div className="kpi-icon">
        {icon}
      </div>
      <div className="kpi-body">
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{format(kpi.value)}</div>
        <div className="kpi-delta">
          {delta === null ? (
            <span className="delta-flat">— no prior data</span>
          ) : (
            <span className={up ? 'delta-up' : 'delta-down'}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {Math.abs(delta)}%
            </span>
          )}
          <span className="kpi-vs">{comparisonLabel}</span>
        </div>
      </div>
    </div>
  );
}
