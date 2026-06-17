import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

async function deposit(amount: number) {
  return request(app).post('/api/users/1/deposit').set('Idempotency-Key', `dep-${amount}-${Date.now()}`).send({ amount });
}

describe('bet placement', () => {
  it('fails when balance is insufficient', async () => {
    const response = await request(app)
      .post('/api/bets')
      .set('Idempotency-Key', 'bet-insufficient')
      .send({ userId: 1, gameId: 'game-1', amount: 100 });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const bets = await prisma.bet.findMany();
    const debits = await prisma.ledger.findMany({ where: { type: 'BET_DEBIT' } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(user.balance).toBe(0);
    expect(bets).toHaveLength(0);
    expect(debits).toHaveLength(0);
  });

  it('is idempotent and only debits once', async () => {
    await deposit(1000);

    const first = await request(app)
      .post('/api/bets')
      .set('Idempotency-Key', 'bet-repeat')
      .send({ userId: 1, gameId: 'game-1', amount: 300 });
    const second = await request(app)
      .post('/api/bets')
      .set('Idempotency-Key', 'bet-repeat')
      .send({ userId: 1, gameId: 'game-1', amount: 300 });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const bets = await prisma.bet.findMany();
    const debits = await prisma.ledger.findMany({ where: { type: 'BET_DEBIT' } });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.betId).toBe(first.body.betId);
    expect(user.balance).toBe(700);
    expect(bets).toHaveLength(1);
    expect(debits).toHaveLength(1);
    expect(debits[0].amount).toBe(-300);
  });

  it('does not overdraft under concurrent bets', async () => {
    await deposit(100);

    const [first, second] = await Promise.all([
      request(app)
        .post('/api/bets')
        .set('Idempotency-Key', 'bet-concurrent-1')
        .send({ userId: 1, gameId: 'game-1', amount: 80 }),
      request(app)
        .post('/api/bets')
        .set('Idempotency-Key', 'bet-concurrent-2')
        .send({ userId: 1, gameId: 'game-1', amount: 80 })
    ]);

    const statuses = [first.status, second.status].sort();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const bets = await prisma.bet.findMany();
    const debits = await prisma.ledger.findMany({ where: { type: 'BET_DEBIT' } });

    expect(statuses).toEqual([201, 422]);
    expect(user.balance).toBe(20);
    expect(bets).toHaveLength(1);
    expect(debits).toHaveLength(1);
  });
});
