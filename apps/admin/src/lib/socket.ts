'use client';

import { io, type Socket } from 'socket.io-client';

/** URL бэкенда из env */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Namespace WebSocket-gateway */
const WS_NAMESPACE = '/session';

/** Задержка перед повторным подключением (мс) */
const WS_RECONNECT_DELAY_MS = 2_000;

/** Максимальное количество попыток реконнекта */
const WS_RECONNECT_ATTEMPTS = 10;

/** Кэш: один сокет на один токен */
let cachedSocket: Socket | null = null;
let cachedToken: string | null = null;

/**
 * Получить или создать Socket.io подключение к /session namespace.
 * При смене токена — пересоздаёт соединение.
 */
export function getSessionSocket(token: string): Socket {
  if (cachedSocket && cachedToken === token && cachedSocket.connected) {
    return cachedSocket;
  }

  if (cachedSocket) {
    cachedSocket.removeAllListeners();
    cachedSocket.disconnect();
  }

  cachedSocket = io(`${BASE_URL}${WS_NAMESPACE}`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: WS_RECONNECT_DELAY_MS,
    reconnectionAttempts: WS_RECONNECT_ATTEMPTS,
    autoConnect: true,
  });

  cachedToken = token;
  return cachedSocket;
}

/**
 * Отключить и сбросить кэшированный сокет.
 * Вызывается при logout или unmount.
 */
export function disconnectSessionSocket(): void {
  if (cachedSocket) {
    cachedSocket.removeAllListeners();
    cachedSocket.disconnect();
    cachedSocket = null;
    cachedToken = null;
  }
}
