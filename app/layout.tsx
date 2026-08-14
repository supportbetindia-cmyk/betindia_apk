import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'BetTracker · Analytics',
  description: 'Live analytics for the BetTracker SDK',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions inject attributes onto
    // <html>/<body> after SSR (e.g. inject_vt_svd), which would otherwise
    // trigger a harmless hydration-mismatch warning. This does NOT hide
    // mismatches inside the app's own components.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
