'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackendApiError } from '@/lib/backend-api';

/** Send the user to sign-in when a backend call returns 401 (no Supabase session). */
export function useAuthRedirect(error: unknown): void {
  const router = useRouter();
  useEffect(() => {
    if (error instanceof BackendApiError && error.status === 401) router.replace('/saas-login');
  }, [error, router]);
}
  