import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { listAllStocks, getStockQuote } from '../services/stockService.js';

const router = Router();

// GET /api/stocks
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(listAllStocks());
  })
);

// GET /api/stocks/:symbol
router.get(
  '/:symbol',
  asyncHandler(async (req, res) => {
    res.json(getStockQuote(req.params.symbol.toUpperCase()));
  })
);

export default router;
