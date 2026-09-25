import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import * as schema from '@copinex/database';
import { db } from '../db/drizzle.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  closeInvestment,
  createPackage,
  listPackages,
  updatePackage,
} from '../services/investment-service.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

/** All packages, including inactive. */
adminRouter.get('/investments/packages', async (_req, res, next) => {
  try {
    const packages = await listPackages(true);
    res.json({ packages });
  } catch (e) {
    next(e);
  }
});

const createPackageSchema = z.object({
  tier: z.number().int().min(1),
  name: z.string().min(1).max(60),
  minAmountCents: z.number().int().positive(),
  maxAmountCents: z.number().int().positive().nullable().optional(),
  monthlyRateBps: z.number().int().positive(),
  dailyRateBps: z.number().int().positive(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  description: z.string().max(200).optional(),
});

adminRouter.post('/investments/packages', async (req, res, next) => {
  try {
    const body = createPackageSchema.parse(req.body);
    const pkg = await createPackage(body);
    res.status(201).json({ package: pkg });
  } catch (e) {
    next(e);
  }
});

const updatePackageSchema = createPackageSchema.partial();

adminRouter.patch('/investments/packages/:id', async (req, res, next) => {
  try {
    const body = updatePackageSchema.parse(req.body);
    const pkg = await updatePackage(req.params.id, body);
    res.json({ package: pkg });
  } catch (e) {
    next(e);
  }
});

/** All investments, optionally filtered by status. */
adminRouter.get('/investments', async (req, res, next) => {
  try {
    const status = req.query.status;
    const where =
      typeof status === 'string' && ['ACTIVE', 'MATURED', 'CLOSED'].includes(status)
        ? eq(schema.investments.status, status as 'ACTIVE' | 'MATURED' | 'CLOSED')
        : undefined;
    const investments = await db.select().from(schema.investments).where(where);
    res.json({ investments });
  } catch (e) {
    next(e);
  }
});

/** Close an investment (stops accrual; no principal refund — documented assumption). */
adminRouter.post('/investments/:id/close', async (req, res, next) => {
  try {
    const investment = await closeInvestment(req.params.id);
    res.json({ investment });
  } catch (e) {
    next(e);
  }
});