import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { submitAssessment, getAssessmentTimeline } from '../services/assessment-service.js';
import { validateAssessmentInput } from '../validators/assessment-validator.js';

export const getMyAssessment = asyncHandler(async (req, res) => {
  const timeline = await getAssessmentTimeline(req.auth.id);
  return ok(res, timeline);
});

export const saveMyAssessment = asyncHandler(async (req, res) => {
  const input = validateAssessmentInput(req.body);
  const record = await submitAssessment(req.auth.id, input);

  return ok(res, {
    total_score: record.total_score,
    interpretation: record.interpretation,
    assessment_round: record.assessment_round,
    assessment_date: record.assessment_date,
    record,
  });
});