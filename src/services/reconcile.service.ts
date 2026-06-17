import type { Bet, Ledger } from '@prisma/client';
import { z } from 'zod';
import { NotFoundError } from '../domain/errors.js';
import { prisma } from '../lib/prisma.js';

const querySchema = z.object({
  userId: z.coerce.number().int().positive()
});

type Issue = {
  code: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export class ReconcileService {
  async reconcile(query: unknown) {
    const { userId } = querySchema.parse(query);
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const [ledgers, bets] = await Promise.all([
      prisma.ledger.findMany({ where: { userId } }),
      prisma.bet.findMany({ where: { userId } })
    ]);

    const ledgerBalance = ledgers.reduce((sum, ledger) => sum + ledger.amount, 0);
    const issues: Issue[] = [];

    if (user.balance !== ledgerBalance) {
      issues.push({
        code: 'BALANCE_MISMATCH',
        message: 'User.balance does not match ledger sum.',
        metadata: { databaseBalance: user.balance, ledgerBalance }
      });
    }

    if (user.balance < 0) {
      issues.push({
        code: 'NEGATIVE_USER_BALANCE',
        message: 'User balance is negative.',
        metadata: { balance: user.balance }
      });
    }

    this.checkLedgerDirections(ledgers, issues);
    this.checkBetLedgers(bets, ledgers, issues);

    return {
      userId,
      databaseBalance: user.balance,
      ledgerBalance,
      matched: user.balance === ledgerBalance,
      betStats: {
        PLACED: bets.filter((bet) => bet.status === 'PLACED').length,
        SETTLED: bets.filter((bet) => bet.status === 'SETTLED').length,
        CANCELLED: bets.filter((bet) => bet.status === 'CANCELLED').length
      },
      issues
    };
  }

  private checkLedgerDirections(ledgers: Ledger[], issues: Issue[]) {
    for (const ledger of ledgers) {
      const shouldBePositive = ['DEPOSIT', 'BET_CREDIT', 'BET_REFUND'].includes(ledger.type);
      const invalidPositive = shouldBePositive && ledger.amount <= 0;
      const invalidDebit = ledger.type === 'BET_DEBIT' && ledger.amount >= 0;

      if (invalidPositive || invalidDebit) {
        issues.push({
          code: 'INVALID_LEDGER_AMOUNT_DIRECTION',
          message: 'Ledger amount direction does not match ledger type.',
          metadata: { ledgerId: ledger.id, type: ledger.type, amount: ledger.amount }
        });
      }
    }
  }

  private checkBetLedgers(bets: Bet[], ledgers: Ledger[], issues: Issue[]) {
    for (const bet of bets) {
      const betLedgers = ledgers.filter((ledger) => ledger.betId === bet.id);
      const debits = betLedgers.filter((ledger) => ledger.type === 'BET_DEBIT');
      const credits = betLedgers.filter((ledger) => ledger.type === 'BET_CREDIT');
      const refunds = betLedgers.filter((ledger) => ledger.type === 'BET_REFUND');

      if (debits.length === 0) {
        issues.push({
          code: 'MISSING_BET_DEBIT',
          message: 'Bet is missing BET_DEBIT ledger.',
          metadata: { betId: bet.id }
        });
      }

      if (bet.status === 'SETTLED' && bet.result === 'WIN' && credits.length === 0) {
        issues.push({
          code: 'MISSING_BET_CREDIT',
          message: 'Winning settled bet is missing BET_CREDIT ledger.',
          metadata: { betId: bet.id }
        });
      }

      if (bet.status === 'CANCELLED' && refunds.length === 0) {
        issues.push({
          code: 'MISSING_BET_REFUND',
          message: 'Cancelled bet is missing BET_REFUND ledger.',
          metadata: { betId: bet.id }
        });
      }

      if (credits.length > 1) {
        issues.push({
          code: 'DUPLICATE_BET_CREDIT',
          message: 'Bet has duplicate BET_CREDIT ledgers.',
          metadata: { betId: bet.id, count: credits.length }
        });
      }

      if (refunds.length > 1) {
        issues.push({
          code: 'DUPLICATE_BET_REFUND',
          message: 'Bet has duplicate BET_REFUND ledgers.',
          metadata: { betId: bet.id, count: refunds.length }
        });
      }
    }
  }
}

export const reconcileService = new ReconcileService();
