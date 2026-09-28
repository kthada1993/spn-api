import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const score1to5 = z.coerce.number().int().min(1).max(5);

const satisfactionSchema = z.object({
  q1_1: score1to5,
  q1_2: score1to5,
  q1_3: score1to5,
  q1_4: score1to5,
  q1_5: score1to5,
  q2_1: score1to5,
  q2_2: score1to5,
  q2_3: score1to5,
  q2_4: score1to5,
  q3_1: score1to5,
  q3_2: score1to5,
  q3_3: score1to5,
  q4_1: score1to5,
  q4_2: score1to5,
  q4_3: score1to5,
  q4_4: score1to5,
  comment_best_activity: z.string().trim().min(1).max(2000),
  comment_barriers: z.string().trim().min(1).max(2000),
  comment_suggestions: z.string().trim().min(1).max(2000),
});

export function validateSatisfactionInput(body) {
  const parsed = satisfactionSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid satisfaction survey input');
  }

  return parsed.data;
}
