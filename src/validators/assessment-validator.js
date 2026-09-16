import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const score0to3 = z
  .coerce
  .number()
  .int()
  .refine((value) => value >= 0 && value <= 3, { message: 'Must be 0-3' });

const assessmentSchema = z
  .object({
    bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    sleep_latency_minutes: z.coerce.number().int().min(0).max(600),
    wake_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    sleep_duration_hours: z.coerce.number().min(0).max(24),
    q5_1: score0to3,
    q5_2: score0to3,
    q5_3: score0to3,
    q5_4: score0to3,
    q5_5: score0to3,
    q5_6: score0to3,
    q5_7: score0to3,
    q5_8: score0to3,
    q5_9: score0to3,
    q5_9_detail: z.string().trim().max(255).optional().nullable(),
    q5_10: score0to3,
    q5_10_detail: z.string().trim().max(255).optional().nullable(),
    q6: score0to3,
    q7: score0to3,
    q8: score0to3,
    q9: score0to3,
    q10: score0to3,
    q10_1: score0to3.optional().nullable(),
    q10_2: score0to3.optional().nullable(),
    q10_3: score0to3.optional().nullable(),
    q10_4: score0to3.optional().nullable(),
    q10_5: score0to3.optional().nullable(),
    q10_5_detail: z.string().trim().max(255).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.q5_9 > 0 && !data.q5_9_detail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q5_9_detail'],
        message: 'q5_9_detail is required when q5_9 > 0',
      });
    }

    if (data.q5_10 > 0 && !data.q5_10_detail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q5_10_detail'],
        message: 'q5_10_detail is required when q5_10 > 0',
      });
    }

    if (data.q10 === 0) {
      return;
    }

    ['q10_1', 'q10_2', 'q10_3', 'q10_4', 'q10_5'].forEach((field) => {
      if (![0, 1, 2, 3].includes(data[field])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when q10 is not 0`,
        });
      }
    });

    if ((data.q10_5 ?? 0) > 0 && !data.q10_5_detail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q10_5_detail'],
        message: 'q10_5_detail is required when q10_5 > 0',
      });
    }
  });

export function validateAssessmentInput(body) {
  const parsed = assessmentSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid assessment input');
  }

  const data = parsed.data;
  const hasPartnerRoom = data.q10 !== 0;

  return {
    ...data,
    bedtime: data.bedtime.length === 5 ? `${data.bedtime}:00` : data.bedtime,
    wake_time: data.wake_time.length === 5 ? `${data.wake_time}:00` : data.wake_time,
    q5_9_detail: data.q5_9 > 0 ? data.q5_9_detail : null,
    q5_10_detail: data.q5_10 > 0 ? data.q5_10_detail : null,
    q10_1: hasPartnerRoom ? data.q10_1 : null,
    q10_2: hasPartnerRoom ? data.q10_2 : null,
    q10_3: hasPartnerRoom ? data.q10_3 : null,
    q10_4: hasPartnerRoom ? data.q10_4 : null,
    q10_5: hasPartnerRoom ? data.q10_5 : null,
    q10_5_detail: hasPartnerRoom && (data.q10_5 ?? 0) > 0 ? data.q10_5_detail : null,
  };
}