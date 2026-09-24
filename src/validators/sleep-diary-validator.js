import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const BEDROOM_ADJUSTMENT_OPTIONS = [
  'มืด',
  'เย็น',
  'เงียบ',
  'ใช้เตียงเพื่อ Sleep & Sex เท่านั้น',
];

const score1to5 = z
  .coerce
  .number()
  .int()
  .refine((value) => value >= 1 && value <= 5, { message: 'Must be 1-5' });

const score1to4 = z
  .coerce
  .number()
  .int()
  .refine((value) => value >= 1 && value <= 4, { message: 'Must be 1-4' });

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

const shiftTypeSchema = z
  .string()
  .transform((value) => {
    const raw = String(value || '').trim();
    const upper = raw.toUpperCase();

    if (raw === 'เช้า' || upper === 'MORNING') return 'MORNING';
    if (raw === 'บ่าย' || upper === 'AFTERNOON') return 'AFTERNOON';
    if (raw === 'ดึก' || upper === 'NIGHT') return 'NIGHT';
    if (raw === 'off' || upper === 'OFF') return 'OFF';

    return raw;
  })
  .refine((value) => ['MORNING', 'AFTERNOON', 'NIGHT', 'OFF'].includes(value), {
    message: "Invalid shift type. Expected เช้า | บ่าย | ดึก | off",
  });

const sleepDiarySchema = z
  .object({
    wake_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shift_type: shiftTypeSchema,
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
    work_stress: score1to4,
    nap_count: z.coerce.number().int().min(0).max(200),
    nap_minutes: z.coerce.number().int().min(0).max(600),
    ot_done: yesNoSchema,
    caffeine_cups: z.coerce.number().int().min(0).max(50),
    sleep_medication: yesNoSchema,
    phone_before_bed_minutes: z.coerce.number().int().min(0).max(600),
    breathing_478: yesNoSchema,
    breathing_478_time: optionalTimeSchema,
    last_caffeine_time: optionalTimeSchema,
    bedroom_adjustment_done: yesNoSchema.optional(),
    nap: yesNoSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.nap_count === 0 && data.nap_minutes !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nap_minutes'],
        message: 'nap_minutes must be 0 when nap_count is 0',
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
  bedroom_adjustment_plan: z.union([z.array(z.string()), z.string()]),
});

function parseBedroomAdjustmentPlan(value) {
  let tokens = [];

  if (Array.isArray(value)) {
    tokens = value;
  } else {
    const text = String(value || '').trim();
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          tokens = parsed;
        }
      } catch {
        tokens = [];
      }
    }

    if (!tokens.length) {
      tokens = text
        .split(/\||,|\n/)
        .map((item) => item.replace(/^[-•\s]+/, '').trim())
        .filter(Boolean);
    }
  }

  const normalized = Array.from(
    new Set(
      tokens
        .map((item) => String(item || '').trim())
        .filter((item) => BEDROOM_ADJUSTMENT_OPTIONS.includes(item))
    )
  );

  return normalized;
}

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
    nap_count: Number(data.nap_count || 0),
    nap: Number(data.nap_count || 0) > 0 ? 1 : 0,
    nap_minutes: Number(data.nap_count || 0) > 0 ? data.nap_minutes : 0,
    ot_done: data.ot_done,
    work_stress: data.work_stress,
    sleep_medication: data.sleep_medication,
    breathing_478_time: null,
    bedroom_adjustment_done: Number.isFinite(Number(data.bedroom_adjustment_done))
      ? Number(data.bedroom_adjustment_done)
      : 0,
  };
}

export function validateSleepDiarySmartGoalInput(body) {
  const parsed = sleepDiarySmartGoalSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid smart goal input');
  }

  const data = parsed.data;
  const bedroomPlanSelections = parseBedroomAdjustmentPlan(data.bedroom_adjustment_plan);

  if (!bedroomPlanSelections.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Invalid smart goal input (bedroom_adjustment_plan: must include at least one valid option)'
    );
  }

  return {
    ...data,
    breathing_time:
      data.breathing_time.length === 5 ? `${data.breathing_time}:00` : data.breathing_time,
    bedroom_adjustment_plan: bedroomPlanSelections.join(' | '),
  };
}

export function validateSleepDiaryDayParam(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 14) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid day number');
  }
  return day;
}