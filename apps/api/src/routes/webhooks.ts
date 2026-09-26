import { Router } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { handlePaymentWebhook } from '../services/payment-service.js';

export const webhooksRouter = Router();

/**
 * Pay2Crypto payment confirmation webhook. Public by nature (the gateway
 * calls it) — gated by a shared secret sent as a header or query param
 * (some gateway webhook configs cannot send custom headers). Idempotent.
 */
webhooksRouter.post('/pay2crypto', async (req, res, next) => {
  try {
    const headerSecret = req.header('x-pay2crypto-secret');
    const querySecret = typeof req.query.secret === 'string' ? req.query.secret : undefined;
    const secret = headerSecret ?? querySecret;

    if (!env.PAY2CRYPTO_WEBHOOK_SECRET || secret !== env.PAY2CRYPTO_WEBHOOK_SECRET) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Invalid webhook secret');
    }

    const result = await handlePaymentWebhook(req.body);
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
});