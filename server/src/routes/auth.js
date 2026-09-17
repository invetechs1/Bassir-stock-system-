import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import * as authService from '../services/authService.js';

const router = Router();

const credentials = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});

// POST /api/auth/register
router.post(
  '/register',
  validate(credentials),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    res.status(201).json(authService.register(email, password));
  })
);

// POST /api/auth/login
router.post(
  '/login',
  validate(credentials),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    res.json(authService.login(email, password));
  })
);

// GET /api/auth/me
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(authService.getUser(req.userId));
  })
);

export default router;
