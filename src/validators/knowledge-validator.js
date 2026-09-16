import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const LESSON_KEYS = ['lesson1', 'lesson2', 'lesson3', 'lesson4'];
const QUIZ_TYPES = ['PRETEST', 'POSTTEST'];

const introProgressSchema = z.object({
  watched_percent: z.coerce.number().min(0).max(100),
});

const lessonVideoProgressSchema = z.object({
  watched_percent: z.coerce.number().min(0).max(100),
  completed: z.coerce.boolean().optional(),
});

const quizSubmitSchema = z.object({
  quiz_type: z.enum(QUIZ_TYPES),
  answers: z.record(z.string().min(1)),
});

export function validateKnowledgeLessonKey(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!LESSON_KEYS.includes(key)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid lesson id');
  }
  return key;
}

export function validateKnowledgeIntroProgressInput(body) {
  const parsed = introProgressSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid intro progress input');
  }
  return parsed.data;
}

export function validateKnowledgeLessonVideoProgressInput(body) {
  const parsed = lessonVideoProgressSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid lesson video progress input');
  }
  return parsed.data;
}

export function validateKnowledgeQuizSubmitInput(body) {
  const parsed = quizSubmitSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid quiz submit input');
  }
  return parsed.data;
}

export { LESSON_KEYS };
export { QUIZ_TYPES };
