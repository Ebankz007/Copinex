import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { HttpError } from '../lib/http-error.js';
import { requireActivated, requireAuth, requireUnactivated } from '../middleware/auth.js';
import { createPayment, listMyPayments } from '../services/payment-service.js';

export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

const depositSchema = z.object({
  amountCents: z.number().int().positive().max(100_000_000),
});

/**
 * Create the $50 ACTIVATION invoice. Only for members who have not paid yet
 * (the fee is one-time), and only one pending invoice at a time. Payment
 * confirmation activates the membership.
 */
paymentsRouter.post('/activate', requireUnactivated, async (req, res, next) => {
  try {
    const [existing] = await db
      .select({ id: schema.payments.id })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.userId, req.user!.id),
          eq(schema.payments.purpose, 'ACTIVATION'),
          eq(schema.payments.status, 'PENDING'),
        ),
      )
      .limit(1);
    if (existing) {
      throw new HttpError(409, 'PENDING_PAYMENT_EXISTS', 'You already have a pending activation payment');
    }
    const payment = await createPayment(req.user!.id, 'ACTIVATION');
    res.status(201).json({ payment });
  } catch (e) {
    next(e);
  }
});

/**
 * Create a DEPOSIT invoice → credits the COPINEX wallet on confirmation.
 * Activated members only (monetary activity).
 */
paymentsRouter.post('/deposit', requireActivated, async (req, res, next) => {
  try {
    const { amountCents } = depositSchema.parse(req.body);
    const payment = await createPayment(req.user!.id, 'DEPOSIT', amountCents);
    res.status(201).json({ payment });
  } catch (e) {
    next(e);
  }
});

/** The member's payment history. */
paymentsRouter.get('/', async (req, res, next) => {
  try {
    const payments = await listMyPayments(req.user!.id);
    res.json({ payments });
  } catch (e) {
    next(e);
  }
});