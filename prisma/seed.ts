import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.ledger.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: 1, username: 'alice', balance: 0 },
      { id: 2, username: 'bob', balance: 0 },
      { id: 3, username: 'carol', balance: 0 }
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
