import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

async function createPlacedBet(amount = 400) {
  await request(app).post('/api/users/1/deposit').set('Idempotency-Key', `dep-cancel-${amount}`).send({ amount: 1000 });
  const bet = await request(app)
    .post('/api/bets')
    .set('Idempotency-Key', `bet-cancel-${amount}`)
    .send({ userId: 1, gameId: 'game-1', amount });
  return bet.body.betId as number;
}

describe('cancel', () => {
  it('refunds balance when cancelling a placed bet', async () => {
    const betId = await createPlacedBet(400);

    const response = await request(app).post(`/api/bets/${betId}/cancel`);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: 1 } });
    const bet = await prisma.bet.findUniqueOrThrow({ where: { id: betId } });
    const refunds = await prisma.ledger.findMany({ where: { betId, type: 'BET_REFUND' } });

    expect(response.status).toBe(200);
    expect(response.body.refund).toBe(400);
    expect(user.balance).toBe(1000);
    expect(bet.status).toBe('CANCELLED');
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(400);
  });

  it('does not allow cancelled bet to settle', async () => {
    const betId = await createPlacedBet(400);
    await request(app).post(`/api/bets/${betId}/cancel`);

    const response = await request(app).post(`/api/bets/${betId}/settle`).send({ result: 'WIN' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BET_STATE_CONFLICT');
  });

  it('does not allow settled bet to cancel', async () => {
    const betId = await createPlacedBet(400);
    await request(app).post(`/api/bets/${betId}/settle`).send({ result: 'LOSE' });

    const response = await request(app).post(`/api/bets/${betId}/cancel`);

    const refunds = await prisma.ledger.findMany({ where: { betId, type: 'BET_REFUND' } });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BET_STATE_CONFLICT');
    expect(refunds).toHaveLength(0);
  });
});
