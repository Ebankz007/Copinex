import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/http-error.js';
import { accrueInvestments } from '../services/investment-service.js';

export const jobsRouter = Router();

jobsRouter.use(requireAuth, requireAdmin);

/**
 * Run the investment accrual job.
 * Optional ?asOf=YYYY-MM-DD simulates running at a future date (admin/dev tool).
 * Idempotent: unique (investment_id, period) rows make re-runs safe.
 */
jobsRouter.post('/accrue-investments', async (req, res, next) => {
  try {
    const raw = req.query.asOf;
    const asOf = raw ? new Date(String(raw)) : new Date();
    if (Number.isNaN(asOf.getTime())) throw new HttpError(400, 'INVALID_DATE', 'asOf must be a valid date');

    const result = await accrueInvestments(asOf);
    res.json({ ok: true, asOf: asOf.toISOString(), ...result });
  } catch (e) {
    next(e);
  }
});