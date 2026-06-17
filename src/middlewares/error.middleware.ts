import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../domain/errors.js';

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid JSON body'
      }
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed'
      }
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error'
    }
  });
}
