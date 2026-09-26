import { Router } from 'express';
import { z } from 'zod';
import { requireActivated, requireAuth } from '../middleware/auth.js';
import {
  getWalletBalances,
  listMyWithdrawals,
  requestWithdrawal,
} from '../services/withdrawals.js';

export const walletsRouter = Router();

walletsRouter.use(requireAuth);

/** Both wallet balances + pending withdrawal holds. */
walletsRouter.get('/', async (req, res, next) => {
  try {
    const balances = await getWalletBalances(req.user!.id);
    res.json(balances);
  } catch (e) {
    next(e);
  }
});

const withdrawSchema = z.object({
  walletType: z.enum(['COPINEX', 'WITHDRAWAL']),
  amountCents: z.number().int().positive(),
});

/** Request a withdrawal: funds are held, admin approves or rejects. Active member only. */
walletsRouter.post('/withdraw', requireActivated, async (req, res, next) => {
  try {
    const body = withdrawSchema.parse(req.body);
    const request = await requestWithdrawal(req.user!.id, body.walletType, body.amountCents);
    res.status(201).json({ request });
  } catch (e) {
    next(e);
  }
});

/** The member's own withdrawal requests. */
walletsRouter.get('/withdrawals', async (req, res, next) => {
  try {
    const requests = await listMyWithdrawals(req.user!.id);
    res.json({ requests });
  } catch (e) {
    next(e);
  }
});