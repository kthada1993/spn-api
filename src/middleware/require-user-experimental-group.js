import { AppError, forbiddenError, unauthorizedError } from '../utils/errors.js';

export function requireUserExperimentalGroup(req, res, next) {
  if (!req.auth) {
    return next(unauthorizedError());
  }

  if (req.auth.role !== 'USER') {
    return next(forbiddenError());
  }

  const studyGroup = Number(req.auth.studyGroup);

  if (studyGroup !== 1 && studyGroup !== 2) {
    return next(
      new AppError(403, 'KNOWLEDGE_ELIGIBLE_GROUP_ONLY', 'เฉพาะผู้ใช้กลุ่มนำร่องหรือกลุ่มทดลองเท่านั้นที่เข้าใช้งานส่วนความรู้ได้')
    );
  }

  return next();
}
