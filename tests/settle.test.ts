import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

async function createPlacedBet(amount = 300) {
  await request(app).post('/api/users/1/deposit').set('Idempotency-Key', `dep-settle-${amount}`).send({ amount: 1000 });
  const bet = await request(app)
    .post('/api/bets')
    .set('Idempotency-Key', `bet-settle-${amount}`)
    .send({ userId: 1, gameId: 'game-1', amount });
  return bet.body.betId as number;
}

describe('settle', () => {
  it('credits balance when result is WIN', async () => {
    const betId = await createPlacedBet(300);

    const response = await request(app).post(`/api/bets/${betId}/settle`).send({ result: 'WIN' });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const bet = await prisma.bet.findUniqueOrThrow({ where: { id: betId } });
    const credits = await prisma.ledger.findMany({ where: { betId, type: 'BET_CREDIT' } });

    expect(response.status).toBe(200);
    expect(response.body.payout).toBe(600);
    expect(user.balance).toBe(1300);
    expect(bet.status).toBe('SETTLED');
    expect(bet.result).toBe('WIN');
    expect(credits).toHaveLength(1);
    expect(credits[0].amount).toBe(600);
  });

  it('rejects repeated settlement', async () => {
    const betId = await createPlacedBet(300);
    await request(app).post(`/api/bets/${betId}/settle`).send({ result: 'WIN' });

    const repeated = await request(app).post(`/api/bets/${betId}/settle`).send({ result: 'WIN' });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const credits = await prisma.ledger.findMany({ where: { betId, type: 'BET_CREDIT' } });

    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('BET_STATE_CONFLICT');
    expect(user.balance).toBe(1300);
    expect(credits).toHaveLength(1);
  });
});
