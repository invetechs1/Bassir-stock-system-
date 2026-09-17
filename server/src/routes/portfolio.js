import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import {
  getPortfolio,
  buy,
  sell,
  getTransactions
} from '../services/portfolioService.js';
import { getHistory } from '../services/analyticsService.js';
import { notifyUser } from '../services/userEvents.js';

const router = Router();

// All portfolio routes require authentication.
router.use(requireAuth);

const order = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((s) => s.toUpperCase()),
  shares: z.coerce.number().int().positive().max(1_000_000)
});

// GET /api/portfolio
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(getPortfolio(req.userId));
  })
);

// POST /api/portfolio/buy
router.post(
  '/buy',
  validate(order),
  asyncHandler(async (req, res) => {
    const result = buy(req.userId, req.body.symbol, req.body.shares);
    notifyUser(req.userId, { type: 'trade' });
    res.json(result);
  })
);

// POST /api/portfolio/sell
router.post(
  '/sell',
  validate(order),
  asyncHandler(async (req, res) => {
    const result = sell(req.userId, req.body.symbol, req.body.shares);
    notifyUser(req.userId, { type: 'trade' });
    res.json(result);
  })
);

// GET /api/portfolio/transactions
router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    res.json(getTransactions(req.userId));
  })
);

// GET /api/portfolio/history - net-worth snapshots over time
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    res.json(getHistory(req.userId));
  })
);

export default router;
