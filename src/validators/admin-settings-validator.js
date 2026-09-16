import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const nameSchema = z
  .object({
    name: z.string().trim().min(1).max(191),
  })
  .strict();

export function validateAdminSettingNameInput(body) {
  const parsed = nameSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid settings payload');
  }

  return parsed.data;
}
