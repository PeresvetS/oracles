import { useAuthStore } from '@/store/auth-store';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Получить токен из Zustand store вне React-компонентов */
function getToken(): string | null {
  return useAuthStore.getState().token;
}

/** Разлогинить и редиректнуть на /login */
function handleUnauthorized(): never {
  useAuthStore.getState().logout();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  throw new Error('Unauthorized');
}

/** Базовый HTTP-запрос с авто-инъекцией JWT */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401) {
    return handleUnauthorized();
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ message: 'Request failed' }));
    const message =
      (errorBody as { message?: string }).message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** API-клиент с JWT авто-инъекцией */
export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),

  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),

  /** Скачать файл с JWT-авторизацией (для экспорта отчётов) */
  downloadBlob: async (path: string): Promise<Blob> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${BASE_URL}${path}`, { headers });
    if (response.status === 401) {
      return handleUnauthorized();
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.blob();
  },
};
