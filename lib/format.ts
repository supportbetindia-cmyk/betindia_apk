// Shared display formatters for the SaaS console. Blank (missing) values render as ''
// so callers can decide their own fallback (e.g. `money(v) || '—'`).

export function money(value: number | string | null | undefined, maxFrac = 0): string {
  if (value == null || value === '') return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: maxFrac }).format(Number(value));
}

export const count = (value: number | string): string => new Intl.NumberFormat('en-IN').format(Number(value));

export function day(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
