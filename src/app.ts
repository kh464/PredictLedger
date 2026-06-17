import express from 'express';
import { adminRouter } from './routes/admin.routes.js';
import { betsRouter } from './routes/bets.routes.js';
import { usersRouter } from './routes/users.routes.js';
import { errorMiddleware } from './middlewares/error.middleware.js';

export const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/users', usersRouter);
app.use('/api/bets', betsRouter);
app.use('/api/admin', adminRouter);

app.use(errorMiddleware);
