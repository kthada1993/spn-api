import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const yesNoSchema = z
  .coerce
  .number()
  .int()
  .refine((value) => value === 0 || value === 1, { message: 'Must be 0 or 1' });

const underlyingDiseaseTypeSchema = z
  .enum(['DM_TYPE2', 'HT', 'DYSLIPIDEMIA', 'CKD', 'ASTHMA_COPD', 'CA', 'OTHER'])
  .optional()
  .nullable();

const screeningSchema = z
  .object({
    full_name: z.string().trim().min(1).max(191),
    age: z.coerce.number().int().min(1).max(120),
    gender: z.coerce.number().int().refine((value) => value === 1 || value === 2),
    marital_status: z.coerce.number().int().refine((value) => [1, 2, 3].includes(value)),
    has_children: yesNoSchema,
    children_count: z.coerce.number().int().min(0).max(20).optional().nullable(),
    education: z.coerce.number().int().refine((value) => [1, 2, 3, 4].includes(value)),
    education_other: z.string().trim().max(191).optional().nullable(),
    hospital_id: z.coerce.number().int().positive(),
    department_id: z.coerce.number().int().positive(),
    current_position_years: z.coerce.number().min(0).max(80),
    current_position_months: z.coerce.number().int().min(0).max(11),
    shift_work_years: z.coerce.number().min(0).max(80),
    shift_work_months: z.coerce.number().int().min(0).max(11),
    night_shift_per_month: z.coerce.number().int().min(0).max(31),
    working_hours_per_week: z.coerce.number().min(0).max(168),
    weight_kg: z.coerce.number().min(20).max(300),
    height_cm: z.coerce.number().min(100).max(250),
    has_underlying_disease: yesNoSchema,
    underlying_disease_type: underlyingDiseaseTypeSchema,
    underlying_disease_detail: z.string().trim().max(1000).optional().nullable(),
    phone: z.string().trim().min(6).max(32),
    line_id: z.string().trim().max(191).optional().nullable(),
    inclusion_1: yesNoSchema,
    inclusion_2: yesNoSchema,
    inclusion_3: yesNoSchema,
    inclusion_4: yesNoSchema,
    exclusion_1: yesNoSchema,
    exclusion_2: yesNoSchema,
    exclusion_3: yesNoSchema,
    exclusion_4: yesNoSchema
  })
  .superRefine((data, ctx) => {
    if (data.education === 4 && !data.education_other) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['education_other'],
        message: 'education_other is required when education is 4'
      });
    }

    if (data.has_underlying_disease === 1 && !data.underlying_disease_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['underlying_disease_type'],
        message: 'underlying_disease_type is required when has_underlying_disease is 1'
      });
    }

    if (
      data.has_underlying_disease === 1 &&
      (data.underlying_disease_type === 'CA' || data.underlying_disease_type === 'OTHER') &&
      !data.underlying_disease_detail
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['underlying_disease_detail'],
        message: 'underlying_disease_detail is required when underlying_disease_type is CA or OTHER'
      });
    }

    if (data.has_children === 1 && (!Number.isFinite(data.children_count) || Number(data.children_count) <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['children_count'],
        message: 'children_count is required when has_children is 1'
      });
    }
  });

export function validateScreeningInput(body) {
  const parsed = screeningSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid screening input');
  }

  const data = parsed.data;

  return {
    ...data,
    children_count: data.has_children === 1 ? Number(data.children_count) : null,
    education_other: data.education === 4 ? data.education_other : null,
    underlying_disease_type: data.has_underlying_disease === 1 ? data.underlying_disease_type : null,
    underlying_disease_detail:
      data.has_underlying_disease === 1 && (data.underlying_disease_type === 'CA' || data.underlying_disease_type === 'OTHER')
        ? data.underlying_disease_detail
        : null,
    line_id: data.line_id || null
  };
}
