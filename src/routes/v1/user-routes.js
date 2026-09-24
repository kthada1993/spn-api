import { Router } from 'express';

import { ok } from '../../utils/api-response.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireUserApproved } from '../../middleware/require-user-approved.js';
import { requireUserExperimentalGroup } from '../../middleware/require-user-experimental-group.js';
import { requireUserScreeningPassed } from '../../middleware/require-user-screening-passed.js';
import { requireUserPsqiPassed } from '../../middleware/require-user-psqi-passed.js';
import { requireUser } from '../../middleware/require-role.js';
import { getMyAssessment, saveMyAssessment } from '../../controllers/assessment-controller.js';
import {
  getCurrentSleepDiarySession,
  getMySleepDiary,
  getMySleepDiarySmartGoal,
  getMySleepDiaryByDay,
  createMySleepDiaryByDay,
  updateMySleepDiaryByDay,
  saveMySleepDiarySmartGoal,
  getMySleepDiarySummary,
} from '../../controllers/sleep-diary-controller.js';
import {
  getMyProfileBasics,
  saveMyProfileBasics,
  getMyScreening,
  getMyScreeningOptions,
  getMyConsent,
  acceptMyConsent,
  saveMyScreening,
} from '../../controllers/screening-controller.js';
import {
  getMyKnowledgeProgress,
  saveMyKnowledgeIntroProgress,
  saveMyKnowledgeLessonVideoProgress,
  saveMyKnowledgeLessonPdfOpened,
  submitMyKnowledgeQuiz,
} from '../../controllers/knowledge-controller.js';

const router = Router();

router.get('/dashboard', authenticate, requireUser, (req, res) => {
  return ok(res, {
    id: req.auth.id,
    role: req.auth.role,
    code_id: req.auth.codeId,
    display_name: req.auth.displayName,
    approval_status: req.auth.approvalStatus,
    study_group: req.auth.studyGroup,
    profile_completed: req.auth.profileCompleted,
    screening_passed: req.auth.screeningPassed,
    consent_accepted: req.auth.consentAccepted,
    psqi_round1_score: req.auth.psqiRound1Score,
    psqi_round1_total_score: req.auth.psqiRound1TotalScore,
    psqi_passed: req.auth.psqiPassed,
  });
});

router.get('/profile-basics', authenticate, requireUser, getMyProfileBasics);
router.post('/profile-basics', authenticate, requireUser, saveMyProfileBasics);

router.get('/screening/options', authenticate, requireUser, requireUserApproved, getMyScreeningOptions);
router.get('/screening', authenticate, requireUser, requireUserApproved, getMyScreening);
router.post('/screening', authenticate, requireUser, requireUserApproved, saveMyScreening);
router.get(
  '/consent',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  getMyConsent
);
router.post(
  '/consent/accept',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  acceptMyConsent
);
router.get(
  '/assessment',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  getMyAssessment
);
router.post(
  '/assessment',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  saveMyAssessment
);
router.get(
  '/sleep-diary/current',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  getCurrentSleepDiarySession
);
router.get(
  '/sleep-diary/summary',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  getMySleepDiarySummary
);
router.get(
  '/sleep-diary',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  getMySleepDiary
);
router.get(
  '/sleep-diary/smart-goal',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  getMySleepDiarySmartGoal
);
router.post(
  '/sleep-diary/smart-goal',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  saveMySleepDiarySmartGoal
);
router.get(
  '/sleep-diary/:day',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  getMySleepDiaryByDay
);
router.post(
  '/sleep-diary/:day',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  createMySleepDiaryByDay
);
router.put(
  '/sleep-diary/:day',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserScreeningPassed,
  requireUserPsqiPassed,
  updateMySleepDiaryByDay
);

router.get(
  '/knowledge/progress',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserExperimentalGroup,
  getMyKnowledgeProgress
);
router.post(
  '/knowledge/intro-progress',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserExperimentalGroup,
  saveMyKnowledgeIntroProgress
);
router.post(
  '/knowledge/lessons/:lessonId/video-progress',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserExperimentalGroup,
  saveMyKnowledgeLessonVideoProgress
);
router.post(
  '/knowledge/lessons/:lessonId/pdf-opened',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserExperimentalGroup,
  saveMyKnowledgeLessonPdfOpened
);
router.post(
  '/knowledge/quiz-submit',
  authenticate,
  requireUser,
  requireUserApproved,
  requireUserExperimentalGroup,
  submitMyKnowledgeQuiz
);

export default router;
