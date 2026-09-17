import { config } from '../config.js';
import { getUser } from '../services/authService.js';
import { ApiError } from '../utils/errors.js';

// Determine whether an authenticated user may control the trading agents.
// When ADMIN_EMAILS is set, only those addresses qualify; otherwise the first
// registered account (user id 1, the system owner) is the sole admin.
export function isAdminUser(userId) {
  const user = getUser(userId); // throws 401 if the account no longer exists
  const email = (user.email || '').toLowerCase();
  if (config.adminEmails.length) return config.adminEmails.includes(email);
  return Number(userId) === 1;
}

// Route guard — run after requireAuth.
export function requireAdmin(req, res, next) {
  try {
    if (!isAdminUser(req.userId)) {
      throw new ApiError(403, 'Admin access required to control trading agents');
    }
    next();
  } catch (err) {
    next(err);
  }
}
