import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { validateProfileBasicsInput } from '../validators/user-profile-validator.js';
import { validateScreeningInput } from '../validators/screening-validator.js';
import {
  getUserScreeningByUserId,
  upsertUserScreening,
  upsertUserProfileBasics,
} from '../services/screening-service.js';
import { getScreeningOptions } from '../services/master-data-service.js';
import {
  getConsentDocument,
  getUserConsentStatus,
  acceptUserConsent,
} from '../services/consent-service.js';

export const getMyProfileBasics = asyncHandler(async (req, res) => {
  const record = await getUserScreeningByUserId(req.auth.id);

  return ok(res, {
    full_name: record?.full_name || null,
    name_prefix: record?.name_prefix || null,
    first_name: record?.first_name || null,
    last_name: record?.last_name || null,
    hospital_id: record?.hospital_id || null,
    study_group: record?.study_group ?? null,
  });
});

export const saveMyProfileBasics = asyncHandler(async (req, res) => {
  const input = validateProfileBasicsInput(req.body);
  const record = await upsertUserProfileBasics(req.auth.id, input);

  return ok(res, {
    full_name: record?.full_name || null,
    name_prefix: record?.name_prefix || null,
    first_name: record?.first_name || null,
    last_name: record?.last_name || null,
    hospital_id: record?.hospital_id || null,
    study_group: record?.study_group ?? null,
    profile_completed: Boolean(record?.full_name && record?.hospital_id),
  });
});

export const getMyScreening = asyncHandler(async (req, res) => {
  const record = await getUserScreeningByUserId(req.auth.id);
  return ok(res, record);
});

export const getMyScreeningOptions = asyncHandler(async (req, res) => {
  const options = await getScreeningOptions();
  return ok(res, options);
});

export const getMyConsent = asyncHandler(async (req, res) => {
  const [document, status] = await Promise.all([
    getConsentDocument(),
    getUserConsentStatus(req.auth.id),
  ]);

  return ok(res, {
    ...status,
    document,
  });
});

export const acceptMyConsent = asyncHandler(async (req, res) => {
  const status = await acceptUserConsent(req.auth.id);
  return ok(res, status);
});

export const saveMyScreening = asyncHandler(async (req, res) => {
  const input = validateScreeningInput(req.body);
  const record = await upsertUserScreening(req.auth.id, input);

  return ok(res, {
    inclusion_result: record.inclusion_result,
    exclusion_result: record.exclusion_result,
    screening_result: record.screening_result,
    record
  });
});
