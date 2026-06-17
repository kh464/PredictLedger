import { Router } from 'express';
import { deposit } from '../controllers/users.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const usersRouter = Router();

usersRouter.post('/:id/deposit', asyncHandler(deposit));
