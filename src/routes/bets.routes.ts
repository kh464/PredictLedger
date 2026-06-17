import { Router } from 'express';
import { cancelBet, createBet, settleBet } from '../controllers/bets.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const betsRouter = Router();

betsRouter.post('/', asyncHandler(createBet));
betsRouter.post('/:id/settle', asyncHandler(settleBet));
betsRouter.post('/:id/cancel', asyncHandler(cancelBet));
