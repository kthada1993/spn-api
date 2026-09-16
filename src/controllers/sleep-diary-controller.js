import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  getOrCreateCurrentSession,
  getDiaryDashboard,
  getDiaryRecordByDay,
  createDiaryRecordByDay,
  updateDiaryRecordByDay,
  getSleepDiarySummary,
  getSleepDiarySmartGoal,
  upsertSleepDiarySmartGoal,
  previewSleepMetrics,
} from '../services/sleep-diary-service.js';
import {
  validateSleepDiaryInput,
  validateSleepDiaryDayParam,
  validateSleepDiarySmartGoalInput,
} from '../validators/sleep-diary-validator.js';

export const getCurrentSleepDiarySession = asyncHandler(async (req, res) => {
  const session = await getOrCreateCurrentSession(req.auth.id);
  return ok(res, session);
});

export const getMySleepDiary = asyncHandler(async (req, res) => {
  const dashboard = await getDiaryDashboard(req.auth.id);
  return ok(res, dashboard);
});

export const getMySleepDiaryByDay = asyncHandler(async (req, res) => {
  const dayNumber = validateSleepDiaryDayParam(req.params.day);
  const payload = await getDiaryRecordByDay(req.auth.id, dayNumber);
  return ok(res, payload);
});

export const createMySleepDiaryByDay = asyncHandler(async (req, res) => {
  const dayNumber = validateSleepDiaryDayParam(req.params.day);
  const input = validateSleepDiaryInput(req.body);
  const result = await createDiaryRecordByDay(req.auth.id, dayNumber, input);

  return ok(res, {
    record: result.record,
    metrics: previewSleepMetrics(input),
    smart_goal_daily: result.smart_goal_daily,
  });
});

export const updateMySleepDiaryByDay = asyncHandler(async (req, res) => {
  const dayNumber = validateSleepDiaryDayParam(req.params.day);
  const input = validateSleepDiaryInput(req.body);
  const result = await updateDiaryRecordByDay(req.auth.id, dayNumber, input);

  return ok(res, {
    record: result.record,
    metrics: previewSleepMetrics(input),
    smart_goal_daily: result.smart_goal_daily,
  });
});

export const getMySleepDiarySummary = asyncHandler(async (req, res) => {
  const summary = await getSleepDiarySummary(req.auth.id);
  return ok(res, summary);
});

export const getMySleepDiarySmartGoal = asyncHandler(async (req, res) => {
  const payload = await getSleepDiarySmartGoal(req.auth.id);
  return ok(res, payload);
});

export const saveMySleepDiarySmartGoal = asyncHandler(async (req, res) => {
  const input = validateSleepDiarySmartGoalInput(req.body);
  const payload = await upsertSleepDiarySmartGoal(req.auth.id, input);
  return ok(res, payload);
});