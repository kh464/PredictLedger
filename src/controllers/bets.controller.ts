import type { Request, Response } from 'express';
import { betsService } from '../services/bets.service.js';

export async function createBet(req: Request, res: Response) {
  const result = await betsService.createBet(req.body, req.header('Idempotency-Key'));
  res.status(result.status).json(result.body);
}

export async function settleBet(req: Request, res: Response) {
  const result = await betsService.settleBet(req.params, req.body);
  res.status(result.status).json(result.body);
}

export async function cancelBet(req: Request, res: Response) {
  const result = await betsService.cancelBet(req.params);
  res.status(result.status).json(result.body);
}
