import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist
} from '../services/watchlistService.js';

const router = Router();
router.use(requireAuth);

const addBody = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((s) => s.toUpperCase())
});

// GET /api/watchlist
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(getWatchlist(req.userId));
  })
);

// POST /api/watchlist
router.post(
  '/',
  validate(addBody),
  asyncHandler(async (req, res) => {
    res.status(201).json(addToWatchlist(req.userId, req.body.symbol));
  })
);

// DELETE /api/watchlist/:symbol
router.delete(
  '/:symbol',
  asyncHandler(async (req, res) => {
    res.json(removeFromWatchlist(req.userId, req.params.symbol.toUpperCase()));
  })
);

export default router;
