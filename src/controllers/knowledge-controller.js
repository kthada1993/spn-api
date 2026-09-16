import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  getKnowledgeProgress,
  saveKnowledgeIntroProgress,
  saveKnowledgeLessonVideoProgress,
  markKnowledgeLessonPdfOpened,
  submitKnowledgeQuiz,
} from '../services/knowledge-service.js';
import {
  validateKnowledgeLessonKey,
  validateKnowledgeIntroProgressInput,
  validateKnowledgeLessonVideoProgressInput,
  validateKnowledgeQuizSubmitInput,
} from '../validators/knowledge-validator.js';

export const getMyKnowledgeProgress = asyncHandler(async (req, res) => {
  const payload = await getKnowledgeProgress(req.auth.id);
  return ok(res, payload);
});

export const saveMyKnowledgeIntroProgress = asyncHandler(async (req, res) => {
  const input = validateKnowledgeIntroProgressInput(req.body);
  const payload = await saveKnowledgeIntroProgress(req.auth.id, input);
  return ok(res, payload);
});

export const saveMyKnowledgeLessonVideoProgress = asyncHandler(async (req, res) => {
  const lessonKey = validateKnowledgeLessonKey(req.params.lessonId);
  const input = validateKnowledgeLessonVideoProgressInput(req.body);
  const payload = await saveKnowledgeLessonVideoProgress(req.auth.id, lessonKey, input);
  return ok(res, payload);
});

export const saveMyKnowledgeLessonPdfOpened = asyncHandler(async (req, res) => {
  const lessonKey = validateKnowledgeLessonKey(req.params.lessonId);
  const payload = await markKnowledgeLessonPdfOpened(req.auth.id, lessonKey);
  return ok(res, payload);
});

export const submitMyKnowledgeQuiz = asyncHandler(async (req, res) => {
  const input = validateKnowledgeQuizSubmitInput(req.body);
  const payload = await submitKnowledgeQuiz(req.auth.id, input);
  return ok(res, payload);
});
