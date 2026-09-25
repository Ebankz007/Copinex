import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const standardHeaders = 'draft-7' as const;

// In-memory store is fine for a single-instance pilot. Swap for a shared
// store (Redis) before running multiple API instances behind a load balancer.
const skip = () => env.NODE_ENV === 'test';

/** Coarse global ceiling: protects every endpoint from runaway traffic. */
export const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 300,
  standardHeaders,
  legacyHeaders: false,
  skip,
  message: { error: 'RATE_LIMITED', message: 'Too many requests, please slow down.' },
});

/** Strict ceiling on auth endpoints: the brute-force surface. */
export const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders,
  legacyHeaders: false,
  skip,
  message: { error: 'RATE_LIMITED', message: 'Too many login attempts, please try again later.' },
});