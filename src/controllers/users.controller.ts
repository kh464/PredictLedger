import type { Request, Response } from 'express';
import { usersService } from '../services/users.service.js';

export async function deposit(req: Request, res: Response) {
  const result = await usersService.deposit(req.params, req.body, req.header('Idempotency-Key'));
  res.status(result.status).json(result.body);
}
