'use client';

import { DATE_RANGE_OPTIONS, type DateRangeKey } from '@/lib/date-range';
import { CalendarDays, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';

export function Topbar({
  lastSync,
  range,
  onRangeChange,
  onLogout,
}: {
  lastSync: Date | null;
  range: DateRangeKey;
  onRangeChange: (range: DateRangeKey) => void;
  onLogout: () => void;
}) {
  return (
    <header className="topbar2">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Business performance and customer activity</p>
      </div>
      <div className="topbar-actions">
        <label className="date-pill range-picker">
          <CalendarDays size={16} strokeWidth={1.8} aria-hidden="true" />
          <select
            className="range-select"
            aria-label="Dashboard date range"
            value={range}
            onChange={(event) => onRangeChange(event.target.value as DateRangeKey)}
          >
            {DATE_RANGE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="sync-pill">
          <RefreshCw size={14} strokeWidth={1.8} className="sync-icon" />
          {lastSync ? `synced ${lastSync.toLocaleTimeString()}` : 'connecting…'}
        </div>
        <div className="admin-chip">
          <div className="admin-avatar"><ShieldCheck size={17} strokeWidth={1.9} /></div>
          <div>
            <div className="admin-name">Admin</div>
            <div className="admin-role">Super Admin</div>
          </div>
        </div>
        <button className="logout-btn2" onClick={onLogout}>
          <LogOut size={15} strokeWidth={1.8} />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
}
