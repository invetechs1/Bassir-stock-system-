import { ApiError } from '../utils/errors.js';
import { logger } from '../logger.js';

// 404 fallthrough for unmatched routes.
export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Central error handler. Express identifies it by its four-arg signature.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res
      .status(err.status)
      .json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
}

// Wrap async route handlers so rejected promises reach the error handler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
