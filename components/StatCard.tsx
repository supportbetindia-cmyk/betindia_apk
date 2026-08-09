export function StatCard({
  label,
  value,
  sub,
  live = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  live?: boolean;
}) {
  return (
    <div className={`card stat${live ? ' live' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}
