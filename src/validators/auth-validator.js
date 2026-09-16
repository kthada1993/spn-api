import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const adminLoginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(6).max(128)
});

export function validateAdminLogin(body) {
  const parsed = adminLoginSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid input');
  }

  return parsed.data;
}
