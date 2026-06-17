import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertCanCancel, assertCanSettle } from '../domain/bet-state-machine.js';
import { BadRequestError, ConflictError, NotFoundError, UnprocessableError } from '../domain/errors.js';
import type { BetStatus } from '../domain/types.js';
import { hashRequest } from '../lib/hash.js';
import { prisma } from '../lib/prisma.js';
import { idempotencyService } from './idempotency.service.js';
import { ledgerService } from './ledger.service.js';

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

const createBetBodySchema = z.object({
  userId: z.number().int().positive(),
  gameId: z.string().min(1),
  amount: z.number().int().positive()
});

const settleBodySchema = z.object({
  result: z.enum(['WIN', 'LOSE'])
});

export class BetsService {
  async createBet(body: unknown, idempotencyKey: string | undefined) {
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency-Key header is required', 'MISSING_IDEMPOTENCY_KEY');
    }

    const payload = createBetBodySchema.parse(body);
    const scope = 'bets.create';
    const requestHash = hashRequest(payload);

    const replay = await idempotencyService.get(scope, idempotencyKey, requestHash);
    if (replay) {
      return replay;
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyRecord.findUnique({
          where: { scope_key: { scope, key: idempotencyKey } }
        });

        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictError('Idempotency key conflict', 'IDEMPOTENCY_CONFLICT');
          }
          return {
            status: existing.responseStatus,
            body: JSON.parse(existing.responseBody) as unknown
          };
        }

        const user = await tx.user.findUnique({ where: { id: payload.userId } });
        if (!user) {
          throw new NotFoundError('User not found', 'USER_NOT_FOUND');
        }

        const debit = await tx.user.updateMany({
          where: {
            id: payload.userId,
            balance: { gte: payload.amount }
          },
          data: {
            balance: { decrement: payload.amount }
          }
        });

        if (debit.count !== 1) {
          throw new UnprocessableError('Insufficient balance', 'INSUFFICIENT_BALANCE');
        }

        const bet = await tx.bet.create({
          data: {
            userId: payload.userId,
            gameId: payload.gameId,
            amount: payload.amount,
            status: 'PLACED'
          }
        });

        await ledgerService.create(tx, {
          userId: payload.userId,
          betId: bet.id,
          type: 'BET_DEBIT',
          amount: -payload.amount,
          refType: 'BET',
          refId: String(bet.id),
          idempotencyKey
        });

        const updatedUser = await tx.user.findUniqueOrThrow({ where: { id: payload.userId } });
        const responseBody = {
          betId: bet.id,
          userId: bet.userId,
          gameId: bet.gameId,
          amount: bet.amount,
          status: bet.status,
          balance: updatedUser.balance
        };

        await idempotencyService.save(tx, {
          scope,
          key: idempotencyKey,
          requestHash,
          responseStatus: 201,
          responseBody,
          resourceType: 'Bet',
          resourceId: String(bet.id)
        });

        return { status: 201, body: responseBody };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replayAfterConflict = await idempotencyService.get(scope, idempotencyKey, requestHash);
        if (replayAfterConflict) return replayAfterConflict;
      }
      throw error;
    }
  }

  async settleBet(params: unknown, body: unknown) {
    const { id } = idParamsSchema.parse(params);
    const { result } = settleBodySchema.parse(body);

    return prisma.$transaction(async (tx) => {
      const bet = await tx.bet.findUnique({ where: { id } });
      if (!bet) {
        throw new NotFoundError('Bet not found', 'BET_NOT_FOUND');
      }

      assertCanSettle(bet.status as BetStatus);

      const update = await tx.bet.updateMany({
        where: { id, status: 'PLACED' },
        data: { status: 'SETTLED', result }
      });

      if (update.count !== 1) {
        throw new ConflictError('Bet state conflict', 'BET_STATE_CONFLICT');
      }

      let payout = 0;
      let balance: number | undefined;

      if (result === 'WIN') {
        payout = bet.amount * 2;
        await ledgerService.create(tx, {
          userId: bet.userId,
          betId: bet.id,
          type: 'BET_CREDIT',
          amount: payout,
          refType: 'BET',
          refId: String(bet.id)
        });

        const updatedUser = await tx.user.update({
          where: { id: bet.userId },
          data: { balance: { increment: payout } }
        });
        balance = updatedUser.balance;
      } else {
        const user = await tx.user.findUniqueOrThrow({ where: { id: bet.userId } });
        balance = user.balance;
      }

      return {
        status: 200,
        body: {
          betId: bet.id,
          status: 'SETTLED',
          result,
          payout,
          balance
        }
      };
    });
  }

  async cancelBet(params: unknown) {
    const { id } = idParamsSchema.parse(params);

    return prisma.$transaction(async (tx) => {
      const bet = await tx.bet.findUnique({ where: { id } });
      if (!bet) {
        throw new NotFoundError('Bet not found', 'BET_NOT_FOUND');
      }

      assertCanCancel(bet.status as BetStatus);

      const update = await tx.bet.updateMany({
        where: { id, status: 'PLACED' },
        data: { status: 'CANCELLED' }
      });

      if (update.count !== 1) {
        throw new ConflictError('Bet state conflict', 'BET_STATE_CONFLICT');
      }

      await ledgerService.create(tx, {
        userId: bet.userId,
        betId: bet.id,
        type: 'BET_REFUND',
        amount: bet.amount,
        refType: 'BET',
        refId: String(bet.id)
      });

      const updatedUser = await tx.user.update({
        where: { id: bet.userId },
        data: { balance: { increment: bet.amount } }
      });

      return {
        status: 200,
        body: {
          betId: bet.id,
          status: 'CANCELLED',
          refund: bet.amount,
          balance: updatedUser.balance
        }
      };
    });
  }
}

export const betsService = new BetsService();
