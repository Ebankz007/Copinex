import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { HttpError } from '../lib/http-error.js';

/** Central error handler — the only place errors become HTTP responses. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  const status = err instanceof Error && 'status' in err ? (err as { status: number }).status : 500;

  if (status >= 500) logger.error({ err }, 'Unhandled error');
  else logger.warn({ err }, 'Request error');

  res.status(status).json({
    error: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
    message: status >= 500 ? 'Something went wrong' : message,
  });
}

/** 404 for unknown routes. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
}