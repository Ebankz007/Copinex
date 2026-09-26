import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  listActiveBrokers,
  listMyPammConnections,
  requestPammConnection,
} from '../services/pamm-service.js';

export const pammRouter = Router();

/** Public broker directory — active partners only. */
pammRouter.get('/brokers', async (_req, res, next) => {
  try {
    const brokers = await listActiveBrokers();
    res.json({ brokers });
  } catch (e) {
    next(e);
  }
});

const requestConnectionSchema = z.object({
  brokerId: z.string().uuid(),
});

/** Client submits a PAMM connection request → gets the broker's private link. */
pammRouter.post('/pamm/connections', requireAuth, async (req, res, next) => {
  try {
    const { brokerId } = requestConnectionSchema.parse(req.body);
    const result = await requestPammConnection(req.user!.id, brokerId);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

/** Client's own connection requests. */
pammRouter.get('/pamm/connections', requireAuth, async (req, res, next) => {
  try {
    const connections = await listMyPammConnections(req.user!.id);
    res.json({ connections });
  } catch (e) {
    next(e);
  }
});