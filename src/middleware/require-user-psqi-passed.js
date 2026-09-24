import { forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireUserPsqiPassed(req, res, next) {
  if (!req.auth) {
    return next(unauthorizedError());
  }

  if (req.auth.role !== 'USER') {
    return next(forbiddenError());
  }

  if (req.auth.psqiPassed !== true) {
    return next(forbiddenError());
  }

  return next();
}
