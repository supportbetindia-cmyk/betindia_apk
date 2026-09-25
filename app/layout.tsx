import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Customer Intelligence', template: '%s · Customer Intelligence' },
  description: 'Customer intelligence and company growth workspace',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning><Providers>{children}</Providers></body>
    </html>
  );
}
