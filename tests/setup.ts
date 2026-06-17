import { beforeEach } from 'vitest';
import { prisma } from '../src/lib/prisma.js';

beforeEach(async () => {
  await prisma.ledger.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: 1, username: 'alice', balance: 0 },
      { id: 2, username: 'bob', balance: 0 }
    ]
  });
});
