import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ConflictError } from '../domain/errors.js';

export type IdempotencyHit = {
  status: number;
  body: unknown;
} | null;

export class IdempotencyService {
  async get(scope: string, key: string, requestHash: string) {
    const record = await prisma.idempotencyRecord.findUnique({
      where: { scope_key: { scope, key } }
    });

    if (!record) {
      return null;
    }

    if (record.requestHash !== requestHash) {
      throw new ConflictError('Idempotency key conflict', 'IDEMPOTENCY_CONFLICT');
    }

    return {
      status: record.responseStatus,
      body: JSON.parse(record.responseBody) as unknown
    };
  }

  async save(
    tx: Prisma.TransactionClient,
    payload: {
      scope: string;
      key: string;
      requestHash: string;
      responseStatus: number;
      responseBody: unknown;
      resourceType?: string;
      resourceId?: string;
    }
  ) {
    await tx.idempotencyRecord.create({
      data: {
        scope: payload.scope,
        key: payload.key,
        requestHash: payload.requestHash,
        responseStatus: payload.responseStatus,
        responseBody: JSON.stringify(payload.responseBody),
        resourceType: payload.resourceType,
        resourceId: payload.resourceId
      }
    });
  }
}

export const idempotencyService = new IdempotencyService();
