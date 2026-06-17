export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type ApiLog = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  status?: number;
  response?: unknown;
  error?: ApiError['error'];
};

export type DepositResponse = {
  userId: number;
  balance: number;
  ledgerId: number;
};

export type CreateBetResponse = {
  betId: number;
  userId: number;
  gameId: string;
  amount: number;
  status: 'PLACED';
  balance: number;
};

export type SettleResponse = {
  betId: number;
  status: 'SETTLED';
  result: 'WIN' | 'LOSE';
  payout: number;
  balance: number;
};

export type CancelResponse = {
  betId: number;
  status: 'CANCELLED';
  refund: number;
  balance: number;
};

export type Reconciliation = {
  userId: number;
  databaseBalance: number;
  ledgerBalance: number;
  matched: boolean;
  betStats: {
    PLACED: number;
    SETTLED: number;
    CANCELLED: number;
  };
  issues: {
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  }[];
};
