'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';

/**
 * Хук авторизации: проверяет наличие токена.
 * Если не авторизован — редиректит на /login.
 */
export function useAuth(): { isAuthenticated: boolean } {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = token !== null;

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, router]);

  return { isAuthenticated };
}
