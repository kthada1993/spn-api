import { AppError, forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireUserControlOnlyGroup(req, res, next) {
  if (!req.auth) {
    return next(unauthorizedError());
  }

  if (req.auth.role !== 'USER') {
    return next(forbiddenError());
  }

  if (Number(req.auth.studyGroup) !== 1) {
    return next(new AppError(403, 'CONTROL_GROUP_ONLY', 'เฉพาะผู้ใช้กลุ่มควบคุมเท่านั้น'));
  }

  return next();
}
