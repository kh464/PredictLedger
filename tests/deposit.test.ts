import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

describe('deposit', () => {
  it('increases balance and creates a DEPOSIT ledger', async () => {
    const response = await request(app)
      .post('/api/users/1/deposit')
      .set('Idempotency-Key', 'dep-001')
      .send({ amount: 1000 });

    expect(response.status).toBe(200);
    expect(response.body.balance).toBe(1000);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const ledgers = await prisma.ledger.findMany({ where: { userId: 1, type: 'DEPOSIT' } });

    expect(user.balance).toBe(1000);
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0].amount).toBe(1000);
  });

  it('is idempotent for repeated requests', async () => {
    const first = await request(app)
      .post('/api/users/1/deposit')
      .set('Idempotency-Key', 'dep-repeat')
      .send({ amount: 1000 });
    const second = await request(app)
      .post('/api/users/1/deposit')
      .set('Idempotency-Key', 'dep-repeat')
      .send({ amount: 1000 });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const ledgers = await prisma.ledger.findMany({ where: { userId: 1, type: 'DEPOSIT' } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(user.balance).toBe(1000);
    expect(ledgers).toHaveLength(1);
  });

  it('returns 409 for same key with different amount', async () => {
    await request(app)
      .post('/api/users/1/deposit')
      .set('Idempotency-Key', 'dep-conflict')
      .send({ amount: 1000 });

    const conflict = await request(app)
      .post('/api/users/1/deposit')
      .set('Idempotency-Key', 'dep-conflict')
      .send({ amount: 2000 });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const ledgers = await prisma.ledger.findMany({ where: { userId: 1, type: 'DEPOSIT' } });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(user.balance).toBe(1000);
    expect(ledgers).toHaveLength(1);
  });
});
