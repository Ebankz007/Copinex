import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  // Routes
  app.use('/api/health', healthRouter);

  // 404 + error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}