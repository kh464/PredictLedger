import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors.js';
import { hashRequest } from '../lib/hash.js';
import { prisma } from '../lib/prisma.js';
import { idempotencyService } from './idempotency.service.js';
import { ledgerService } from './ledger.service.js';

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
});

const depositBodySchema = z.object({
  amount: z.number().int().positive()
});

export class UsersService {
  async deposit(params: unknown, body: unknown, idempotencyKey: string | undefined) {
    if (!idempotencyKey) {
      throw new BadRequestError('Idempotency-Key header is required', 'MISSING_IDEMPOTENCY_KEY');
    }

    const { id: userId } = paramsSchema.parse(params);
    const { amount } = depositBodySchema.parse(body);
    const scope = `users.deposit:${userId}`;
    const requestHash = hashRequest({ userId, amount });

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

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new NotFoundError('User not found', 'USER_NOT_FOUND');
        }

        const ledger = await ledgerService.create(tx, {
          userId,
          type: 'DEPOSIT',
          amount,
          refType: 'DEPOSIT',
          refId: idempotencyKey,
          idempotencyKey
        });

        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } }
        });

        const responseBody = {
          userId,
          balance: updatedUser.balance,
          ledgerId: ledger.id
        };

        await idempotencyService.save(tx, {
          scope,
          key: idempotencyKey,
          requestHash,
          responseStatus: 200,
          responseBody,
          resourceType: 'Ledger',
          resourceId: String(ledger.id)
        });

        return { status: 200, body: responseBody };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replayAfterConflict = await idempotencyService.get(scope, idempotencyKey, requestHash);
        if (replayAfterConflict) return replayAfterConflict;
      }
      throw error;
    }
  }
}

export const usersService = new UsersService();
