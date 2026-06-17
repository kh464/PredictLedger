import { ConflictError } from './errors.js';
import type { BetStatus } from './types.js';

export function assertCanSettle(status: BetStatus) {
  if (status !== 'PLACED') {
    throw new ConflictError('Only PLACED bet can be settled', 'BET_STATE_CONFLICT');
  }
}

export function assertCanCancel(status: BetStatus) {
  if (status !== 'PLACED') {
    throw new ConflictError('Only PLACED bet can be cancelled', 'BET_STATE_CONFLICT');
  }
}
