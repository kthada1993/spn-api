import { AppError, forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireUserExperimentalOnlyGroup(req, res, next) {
  if (!req.auth) {
    return next(unauthorizedError());
  }

  if (req.auth.role !== 'USER') {
    return next(forbiddenError());
  }

  if (Number(req.auth.studyGroup) !== 2) {
    return next(new AppError(403, 'EXPERIMENTAL_GROUP_ONLY', 'เฉพาะผู้ใช้กลุ่มทดลองเท่านั้น'));
  }

  return next();
}
