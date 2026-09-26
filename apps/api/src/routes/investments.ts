import { Router } from 'express';
import { z } from 'zod';
import { requireActivated, requireAuth } from '../middleware/auth.js';
import {
  createInvestment,
  getInvestmentDetail,
  getWithdrawalWalletSummary,
  listMyInvestments,
  listPackages,
} from '../services/investment-service.js';

export const investmentsRouter = Router();

investmentsRouter.use(requireAuth);

/** Active investment packages (tiers). */
investmentsRouter.get('/packages', async (_req, res, next) => {
  try {
    const packages = await listPackages(false);
    res.json({ packages });
  } catch (e) {
    next(e);
  }
});

/** Withdrawal wallet summary: available vs locked. */
investmentsRouter.get('/wallet', async (req, res, next) => {
  try {
    const summary = await getWithdrawalWalletSummary(req.user!.id);
    res.json({ wallet: summary });
  } catch (e) {
    next(e);
  }
});

/** My investments. */
investmentsRouter.get('/', async (req, res, next) => {
  try {
    const investments = await listMyInvestments(req.user!.id);
    res.json({ investments });
  } catch (e) {
    next(e);
  }
});

const createSchema = z.object({
  amountCents: z.number().int().min(5000).max(1_000_000_000),
});

/** Create an investment. Tier is derived server-side from the amount. Active member only. */
investmentsRouter.post('/', requireActivated, async (req, res, next) => {
  try {
    const { amountCents } = createSchema.parse(req.body);
    const result = await createInvestment(req.user!.id, amountCents);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

/** Investment detail (owner or admin). */
investmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === 'ADMIN';
    const detail = await getInvestmentDetail(req.user!.id, req.params.id, isAdmin);
    res.json(detail);
  } catch (e) {
    next(e);
  }
});