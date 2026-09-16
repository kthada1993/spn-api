import { forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireUserConsentAccepted(req, res, next) {
  if (!req.auth) {
    return next(unauthorizedError());
  }

  if (req.auth.role !== 'USER') {
    return next(forbiddenError());
  }

  if (!req.auth.consentAccepted) {
    return next(forbiddenError());
  }

  return next();
}
