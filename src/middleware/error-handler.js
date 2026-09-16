import { fail } from '../utils/api-response.js';

export function notFoundHandler(req, res) {
  return fail(res, 404, 'NOT_FOUND', 'Resource not found');
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';

  const safeMessage =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';

  return fail(res, status, code, safeMessage);
}
