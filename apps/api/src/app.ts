import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { globalLimiter, authLimiter } from './middleware/rate-limit.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { investmentsRouter } from './routes/investments.js';
import { walletsRouter } from './routes/wallets.js';
import { adminRouter } from './routes/admin.js';
import { jobsRouter } from './routes/jobs.js';

export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', globalLimiter);

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/investments', investmentsRouter);
  app.use('/api/wallets', walletsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/jobs', jobsRouter);

  // 404 + error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}