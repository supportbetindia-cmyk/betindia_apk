import type { Count } from '@/lib/metrics';

export function BarList({ items, empty }: { items: Count[]; empty: string }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div>
      {items.map((item) => (
        <div className="barrow" key={item.label}>
          <div className="meta">
            <div className="name" title={item.label}>
              {item.label}
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
          <div className="num">{item.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
