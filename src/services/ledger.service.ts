import type { Prisma } from '@prisma/client';
import type { LedgerType } from '../domain/types.js';

export class LedgerService {
  async create(
    tx: Prisma.TransactionClient,
    payload: {
      userId: number;
      betId?: number;
      type: LedgerType;
      amount: number;
      refType: string;
      refId: string;
      idempotencyKey?: string;
    }
  ) {
    return tx.ledger.create({
      data: {
        userId: payload.userId,
        betId: payload.betId,
        type: payload.type,
        amount: payload.amount,
        refType: payload.refType,
        refId: payload.refId,
        idempotencyKey: payload.idempotencyKey
      }
    });
  }
}

export const ledgerService = new LedgerService();
