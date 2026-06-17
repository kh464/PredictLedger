import type { Request, Response } from 'express';
import { reconcileService } from '../services/reconcile.service.js';

export async function reconcile(req: Request, res: Response) {
  const result = await reconcileService.reconcile(req.query);
  res.status(200).json(result);
}
