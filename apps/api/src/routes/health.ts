import { Router } from 'express';
import { pool } from '../db/pool.js';
import { FEE_SPLIT_TOTAL, PROFIT_SPLIT_TOTAL } from '@copinex/engine';

export const healthRouter = Router();

/** Liveness + DB connectivity + §12 reconciliation invariants in one probe. */
healthRouter.get('/', async (_req, res) => {
  let db = 'down';
  try {
    await pool.query('SELECT 1');
    db = 'up';
  } catch {
    // leave db = 'down'
  }

  res.status(db === 'up' ? 200 : 503).json({
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    reconciliation: {
      feeSplitTotal: FEE_SPLIT_TOTAL,
      profitSplitTotal: PROFIT_SPLIT_TOTAL,
      feeSplitReconciles: Math.round(FEE_SPLIT_TOTAL * 100) === 100,
      profitSplitReconciles: Math.round(PROFIT_SPLIT_TOTAL * 100) === 100,
    },
  });
});