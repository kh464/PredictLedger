import type {
  ApiError,
  ApiLog,
  CancelResponse,
  CreateBetResponse,
  DepositResponse,
  Reconciliation,
  SettleResponse
} from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type ApiResult<T> = {
  data?: T;
  log: ApiLog;
};

async function request<T>(method: string, path: string, options: { headers?: Record<string, string>; body?: unknown } = {}) {
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers
  };

  const log: ApiLog = {
    method,
    url: path,
    headers,
    body: options.body
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T | ApiError) : undefined;
  log.status = response.status;

  if (!response.ok) {
    const errorPayload = payload as ApiError;
    log.error = errorPayload.error ?? {
      code: 'REQUEST_FAILED',
      message: response.statusText
    };
    log.response = payload;
    return { log } satisfies ApiResult<T>;
  }

  log.response = payload;
  return { data: payload as T, log } satisfies ApiResult<T>;
}

export const api = {
  health() {
    return request<{ ok: boolean }>('GET', '/health');
  },

  deposit(input: { userId: number; amount: number; idempotencyKey: string }) {
    return request<DepositResponse>('POST', `/api/users/${input.userId}/deposit`, {
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: { amount: input.amount }
    });
  },

  createBet(input: { userId: number; gameId: string; amount: number; idempotencyKey: string }) {
    return request<CreateBetResponse>('POST', '/api/bets', {
      headers: { 'Idempotency-Key': input.idempotencyKey },
      body: {
        userId: input.userId,
        gameId: input.gameId,
        amount: input.amount
      }
    });
  },

  settleBet(input: { betId: number; result: 'WIN' | 'LOSE' }) {
    return request<SettleResponse>('POST', `/api/bets/${input.betId}/settle`, {
      body: { result: input.result }
    });
  },

  cancelBet(betId: number) {
    return request<CancelResponse>('POST', `/api/bets/${betId}/cancel`);
  },

  reconcile(userId: number) {
    return request<Reconciliation>('GET', `/api/admin/reconcile?userId=${userId}`);
  }
};
