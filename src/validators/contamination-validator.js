import { z } from 'zod';

import { AppError } from '../utils/errors.js';

const yesNoSchema = z.enum(['YES', 'NO']);
const q2FrequencySchema = z.enum(['ONCE', 'SOMETIMES', 'REGULAR']);
const q4Schema = z.enum(['NEVER', 'LITTLE', 'TRANSFERRED']);
const part2TimeframeSchema = z.enum(['WEEK1_2', 'WEEK3_5', 'WEEK6_8']);

const contaminationSchema = z.object({
  q1_received_material: yesNoSchema,
  q1_material_detail: z.string().trim().max(2000).optional().nullable(),
  q2_received_breathing: yesNoSchema,
  q2_breathing_frequency: q2FrequencySchema.optional().nullable(),
  q3_received_strategy: yesNoSchema,
  q3_strategy_detail: z.string().trim().max(2000).optional().nullable(),
  q4_talked_with_experimental: q4Schema,
  part2_timeframe: part2TimeframeSchema.optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.q1_received_material === 'YES' && !value.q1_material_detail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['q1_material_detail'],
      message: 'กรุณาระบุสื่อที่ได้รับ',
    });
  }

  if (value.q2_received_breathing === 'YES' && !value.q2_breathing_frequency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['q2_breathing_frequency'],
      message: 'กรุณาระบุความถี่ในการฝึกปฏิบัติ',
    });
  }

  if (value.q3_received_strategy === 'YES' && !value.q3_strategy_detail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['q3_strategy_detail'],
      message: 'กรุณาระบุเทคนิคที่นำมาปรับใช้',
    });
  }

  const hasContamination =
    value.q1_received_material === 'YES' ||
    value.q2_received_breathing === 'YES' ||
    value.q3_received_strategy === 'YES' ||
    value.q4_talked_with_experimental !== 'NEVER';

  if (hasContamination && !value.part2_timeframe) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['part2_timeframe'],
      message: 'กรุณาระบุช่วงเวลาที่เริ่มได้รับข้อมูลหรือเทคนิค',
    });
  }
});

export function validateContaminationInput(body) {
  const parsed = contaminationSchema.safeParse(body);

  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid contamination screening input');
  }

  return parsed.data;
}
