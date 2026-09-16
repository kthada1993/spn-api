import { z } from 'zod';

import { AppError } from '../utils/errors.js';

function buildFullName(namePrefix, firstName, lastName) {
  return [namePrefix, firstName, lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

const profileBasicsSchema = z.object({
  // New payload fields
  name_prefix: z.string().trim().max(32).optional().nullable(),
  first_name: z.string().trim().max(100).optional().nullable(),
  last_name: z.string().trim().max(100).optional().nullable(),
  // Backward-compatible payload fields
  prefix: z.string().trim().max(32).optional().nullable(),
  firstName: z.string().trim().max(100).optional().nullable(),
  lastName: z.string().trim().max(100).optional().nullable(),
  // Legacy full name payload
  full_name: z.string().trim().max(191).optional().nullable(),
  // Accept snake_case and camelCase for safer mixed deployments
  hospital_id: z.union([z.string(), z.number()]).optional().nullable(),
  hospitalId: z.union([z.string(), z.number()]).optional().nullable(),
  department_id: z.union([z.string(), z.number(), z.null(), z.undefined()]).optional(),
  departmentId: z.union([z.string(), z.number(), z.null(), z.undefined()]).optional(),
});

function normalizeOptionalInteger(value) {
  if (value == null || value === '') return null;
  const normalized = Number(value);
  if (!Number.isInteger(normalized)) return null;
  return normalized;
}

export function validateProfileBasicsInput(body) {
  const parsed = profileBasicsSchema.safeParse(body);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues?.[0];
    const issuePath = firstIssue?.path?.join('.') || 'payload';
    const issueMessage = firstIssue?.message || 'Invalid profile input';
    throw new AppError(400, 'VALIDATION_ERROR', `${issuePath}: ${issueMessage}`);
  }

  const data = parsed.data;

  const namePrefix = data.name_prefix ?? data.prefix ?? null;
  const firstName = (data.first_name ?? data.firstName ?? '').trim();
  const lastName = (data.last_name ?? data.lastName ?? '').trim();
  const normalizedFullName = (data.full_name || '').trim() || buildFullName(namePrefix, firstName, lastName);
  const normalizedHospitalId = normalizeOptionalInteger(data.hospital_id ?? data.hospitalId);
  const normalizedDepartmentId = normalizeOptionalInteger(data.department_id ?? data.departmentId);

  if (!normalizedFullName) {
    throw new AppError(400, 'VALIDATION_ERROR', 'full_name: Name is required');
  }

  if (!normalizedHospitalId || normalizedHospitalId <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'hospital_id: Invalid hospital');
  }

  if (normalizedDepartmentId != null && normalizedDepartmentId <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'department_id: Invalid department');
  }

  return {
    name_prefix: namePrefix || null,
    first_name: firstName || null,
    last_name: lastName || null,
    full_name: normalizedFullName,
    hospital_id: normalizedHospitalId,
    department_id: normalizedDepartmentId,
  };
}
