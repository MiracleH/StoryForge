import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { createError } from './errorHandler';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues[0]?.message || 'Validation failed';
      throw createError(message, 400);
    }
    req.body = result.data;
    next();
  };
}
