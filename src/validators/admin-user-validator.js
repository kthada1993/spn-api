import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const updateAdminUserSchema = z
  .object({
    approval_status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    study_group: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]).optional(),
  })
  .refine((value) => value.approval_status !== undefined || value.study_group !== undefined, {
    message: 'At least one field is required',
  });

export function validateAdminUserUpdateInput(body) {
  const parsed = updateAdminUserSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid admin user update input');
  }

  return parsed.data;
}
