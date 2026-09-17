import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { placeOrder, getOrders, cancelOrder } from '../services/orderService.js';
import { notifyUser } from '../services/userEvents.js';

const router = Router();
router.use(requireAuth);

const orderBody = z.object({
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['LIMIT', 'STOP']).default('LIMIT'),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((s) => s.toUpperCase()),
  shares: z.coerce.number().int().positive().max(1_000_000),
  limitPrice: z.coerce.number().positive().max(1_000_000),
  // Optional time-in-force as an epoch-millisecond expiry; omit for good-till-cancel.
  expiresAt: z.coerce.number().int().positive().optional()
});

// GET /api/orders
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(getOrders(req.userId));
  })
);

// POST /api/orders - place a limit or stop order
router.post(
  '/',
  validate(orderBody),
  asyncHandler(async (req, res) => {
    const placed = placeOrder(req.userId, req.body);
    notifyUser(req.userId, { type: 'orders' });
    res.status(201).json(placed);
  })
);

// DELETE /api/orders/:id - cancel a pending order
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const cancelled = cancelOrder(req.userId, req.params.id);
    notifyUser(req.userId, { type: 'orders' });
    res.json(cancelled);
  })
);

export default router;
