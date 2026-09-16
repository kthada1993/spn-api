import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validateAdminSettingNameInput } from '../validators/admin-settings-validator.js';
import {
  listHospitals,
  createHospital,
  updateHospital,
  deleteHospital,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../services/master-data-service.js';

export const listAdminHospitals = asyncHandler(async (req, res) => {
  const items = await listHospitals({ includeInactive: true });
  return ok(res, { items, total: items.length });
});

export const createAdminHospital = asyncHandler(async (req, res) => {
  const input = validateAdminSettingNameInput(req.body);
  const item = await createHospital(input);
  return ok(res, item);
});

export const updateAdminHospital = asyncHandler(async (req, res) => {
  const input = validateAdminSettingNameInput(req.body);
  const item = await updateHospital(req.params.id, input);
  return ok(res, item);
});

export const deleteAdminHospitalById = asyncHandler(async (req, res) => {
  await deleteHospital(req.params.id);
  return ok(res, { success: true });
});

export const listAdminDepartments = asyncHandler(async (req, res) => {
  const items = await listDepartments({ includeInactive: true });
  return ok(res, { items, total: items.length });
});

export const createAdminDepartment = asyncHandler(async (req, res) => {
  const input = validateAdminSettingNameInput(req.body);
  const item = await createDepartment(input);
  return ok(res, item);
});

export const updateAdminDepartment = asyncHandler(async (req, res) => {
  const input = validateAdminSettingNameInput(req.body);
  const item = await updateDepartment(req.params.id, input);
  return ok(res, item);
});

export const deleteAdminDepartmentById = asyncHandler(async (req, res) => {
  await deleteDepartment(req.params.id);
  return ok(res, { success: true });
});
