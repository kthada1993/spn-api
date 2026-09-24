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
  const result = await submitAssessment(req.auth.id, input);

  return ok(res, result);
});