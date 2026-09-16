import { forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireUserApproved(req, res, next) {
  if (!req.auth) {
    return next(unauthorizedError());
  }

  if (req.auth.role !== 'USER') {
    return next(forbiddenError());
  }

  if (req.auth.approvalStatus !== 'APPROVED') {
    return next(forbiddenError());
  }

  if (!req.auth.profileCompleted) {
    return next(forbiddenError());
  }

  return next();
}
