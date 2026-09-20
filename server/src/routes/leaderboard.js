import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { getLeaderboard } from '../services/analyticsService.js';

const router = Router();
router.use(requireAuth);

// GET /api/leaderboard - users ranked by net worth (emails masked).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(getLeaderboard(req.userId));
  })
);

export default router;
