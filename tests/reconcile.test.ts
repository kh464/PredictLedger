import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

async function prepareWinScenario() {
  await request(app).post('/api/users/1/deposit').set('Idempotency-Key', 'dep-rec').send({ amount: 1000 });
  const bet = await request(app)
    .post('/api/bets')
    .set('Idempotency-Key', 'bet-rec')
    .send({ userId: 1, gameId: 'game-1', amount: 300 });
  await request(app).post(`/api/bets/${bet.body.betId}/settle`).send({ result: 'WIN' });
  return bet.body.betId as number;
}

describe('reconcile', () => {
  it('returns matching database and ledger balances', async () => {
    await prepareWinScenario();

    const response = await request(app).get('/api/admin/reconcile?userId=1');

    expect(response.status).toBe(200);
    expect(response.body.databaseBalance).toBe(1300);
    expect(response.body.ledgerBalance).toBe(1300);
    expect(response.body.matched).toBe(true);
    expect(response.body.betStats.SETTLED).toBe(1);
    expect(response.body.issues).toEqual([]);
  });

  it('detects balance mismatch', async () => {
    await request(app).post('/api/users/1/deposit').set('Idempotency-Key', 'dep-mismatch').send({ amount: 1000 });
    await prisma.user.update({ where: { id: 1 }, data: { balance: 9999 } });

    const response = await request(app).get('/api/admin/reconcile?userId=1');

    expect(response.status).toBe(200);
    expect(response.body.matched).toBe(false);
    expect(response.body.issues.map((issue: { code: string }) => issue.code)).toContain('BALANCE_MISMATCH');
  });

  it('detects duplicate credit ledger', async () => {
    const betId = await prepareWinScenario();
    await prisma.ledger.create({
      data: {
        userId: 1,
        betId,
        type: 'BET_CREDIT',
        amount: 600,
        refType: 'BET',
        refId: String(betId)
      }
    });

    const response = await request(app).get('/api/admin/reconcile?userId=1');

    expect(response.body.issues.map((issue: { code: string }) => issue.code)).toContain('DUPLICATE_BET_CREDIT');
  });
});
