import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const score1to5 = z
  .coerce
  .number()
  .int()
  .refine((value) => value >= 1 && value <= 5, { message: 'Must be 1-5' });

const yesNoSchema = z
  .coerce
  .number()
  .int()
  .refine((value) => value === 0 || value === 1, { message: 'Must be 0 or 1' });

const optionalTimeSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    .optional()
    .nullable()
);

const sleepDiarySchema = z
  .object({
    wake_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shift_type: z.enum(['MORNING', 'AFTERNOON', 'NIGHT', 'OFF']),
    bedtime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    attempt_sleep_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    sol_minutes: z.coerce.number().int().min(0).max(1000),
    number_of_awakenings: z.coerce.number().int().min(0).max(200),
    waso_minutes: z.coerce.number().int().min(0).max(1000),
    final_wake_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    get_up_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
    sleep_after_final_wake_minutes: z.coerce.number().int().min(0).max(600),
    early_wake: yesNoSchema,
    sleep_quality: score1to5,
    morning_refreshment: score1to5,
    shift_sleepiness: score1to5,
    work_stress: score1to5,
    nap: yesNoSchema,
    nap_minutes: z.coerce.number().int().min(0).max(600),
    caffeine_cups: z.coerce.number().int().min(0).max(50),
    phone_before_bed_minutes: z.coerce.number().int().min(0).max(600),
    breathing_478: yesNoSchema,
    breathing_478_time: optionalTimeSchema,
    last_caffeine_time: optionalTimeSchema,
    bedroom_adjustment_done: yesNoSchema,
  })
  .superRefine((data, ctx) => {
    if (data.nap === 0 && data.nap_minutes !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nap_minutes'],
        message: 'nap_minutes must be 0 when nap is 0',
      });
    }

    if (data.breathing_478 === 1 && !data.breathing_478_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['breathing_478_time'],
        message: 'breathing_478_time is required when breathing_478 is 1',
      });
    }

    if (data.caffeine_cups > 0 && !data.last_caffeine_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['last_caffeine_time'],
        message: 'last_caffeine_time is required when caffeine_cups > 0',
      });
    }
  });

const sleepDiarySmartGoalSchema = z.object({
  sleep_hours_target: z.coerce.number().min(1).max(24),
  night_shift_nap_minutes_target: z.coerce.number().int().min(0).max(600),
  breathing_frequency_days: z.coerce.number().int().min(1).max(14),
  breathing_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  caffeine_cutoff_hours: z.coerce.number().min(0).max(24),
  bedroom_adjustment_plan: z.string().trim().min(3).max(1000),
});

function formatZodIssues(issues) {
  if (!Array.isArray(issues) || issues.length === 0) return 'Invalid sleep diary input';

  const details = issues
    .slice(0, 3)
    .map((issue) => {
      const path = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') : 'payload';
      return `${path}: ${issue.message}`;
    })
    .join('; ');

  return `Invalid sleep diary input (${details})`;
}

export function validateSleepDiaryInput(body) {
  const parsed = sleepDiarySchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', formatZodIssues(parsed.error.issues));
  }

  const data = parsed.data;

  return {
    ...data,
    bedtime: data.bedtime.length === 5 ? `${data.bedtime}:00` : data.bedtime,
    attempt_sleep_time:
      data.attempt_sleep_time.length === 5 ? `${data.attempt_sleep_time}:00` : data.attempt_sleep_time,
    final_wake_time: data.final_wake_time.length === 5 ? `${data.final_wake_time}:00` : data.final_wake_time,
    get_up_time: data.get_up_time.length === 5 ? `${data.get_up_time}:00` : data.get_up_time,
    breathing_478_time: data.breathing_478_time
      ? data.breathing_478_time.length === 5
        ? `${data.breathing_478_time}:00`
        : data.breathing_478_time
      : null,
    last_caffeine_time: data.last_caffeine_time
      ? data.last_caffeine_time.length === 5
        ? `${data.last_caffeine_time}:00`
        : data.last_caffeine_time
      : null,
    nap_minutes: data.nap === 1 ? data.nap_minutes : 0,
  };
}

export function validateSleepDiarySmartGoalInput(body) {
  const parsed = sleepDiarySmartGoalSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid smart goal input');
  }

  const data = parsed.data;

  return {
    ...data,
    breathing_time:
      data.breathing_time.length === 5 ? `${data.breathing_time}:00` : data.breathing_time,
    bedroom_adjustment_plan: data.bedroom_adjustment_plan.trim(),
  };
}

export function validateSleepDiaryDayParam(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 14) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid day number');
  }
  return day;
}