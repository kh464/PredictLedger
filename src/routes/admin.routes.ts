import { Router } from 'express';
import { reconcile } from '../controllers/admin.controller.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const adminRouter = Router();

adminRouter.get('/reconcile', asyncHandler(reconcile));
