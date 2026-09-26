'use client';
import { Suspense } from 'react';
import { MasterFilterProvider } from '@/components/MasterFilterProvider';

import {
  environmentManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: true,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <Suspense fallback={<div role="status" className="empty2">Loading workspace…</div>}>
        <MasterFilterProvider>{children}</MasterFilterProvider>
      </Suspense>
    </QueryClientProvider>
  );
}
