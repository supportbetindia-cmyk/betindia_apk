import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Self-hosted by Next (no layout shift, no runtime request). Exposed as --font-sans;
// globals.css references it, with system fonts as the fallback while it loads.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Customer Intelligence', template: '%s · Customer Intelligence' },
  description: 'Customer intelligence and company growth workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
