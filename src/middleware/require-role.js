import { forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth) {
      return next(unauthorizedError());
    }

    if (req.auth.role !== role) {
      return next(forbiddenError());
    }

    return next();
  };
}

export const requireUser = requireRole('USER');
export const requireAdmin = requireRole('ADMIN');
