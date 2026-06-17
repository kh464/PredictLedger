import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { BadRequestError } from '../domain/errors.js';

export function validate(schema: { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.params) req.params = schema.params.parse(req.params);
      if (schema.query) req.query = schema.query.parse(req.query);
      next();
    } catch (error) {
      next(new BadRequestError('Validation failed'));
    }
  };
}
