// Application error carrying an HTTP status and optional structured details.
// Thrown by services/routes and translated by the central error handler.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const conflict = (msg, details) => new ApiError(409, msg, details);
