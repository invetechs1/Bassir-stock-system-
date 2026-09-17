import { badRequest } from '../utils/errors.js';

// Build middleware that validates a request section against a zod schema and
// replaces it with the parsed (coerced, stripped) result.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message
    }));
    return next(badRequest('Validation failed', details));
  }
  req[source] = result.data;
  next();
};
