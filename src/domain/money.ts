import { BadRequestError } from './errors.js';

export function assertPositiveInteger(value: unknown, fieldName = 'amount'): number {
  const num: number = typeof value === 'string' ? Number(value) : (value as number);
  if (!Number.isInteger(num) || num <= 0) {
    throw new BadRequestError(`${fieldName} must be a positive integer`);
  }
  return num;
}
