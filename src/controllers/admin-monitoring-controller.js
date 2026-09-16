import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  getMonitoringOverview,
  listMonitoringPsqi,
  getMonitoringPsqiDetail,
  listMonitoringSleepDiary,
  getMonitoringSleepDiaryDetail,
  listMonitoringSmartGoal,
  getMonitoringSmartGoalDetail,
  listMonitoringLearning,
  getMonitoringLearningDetail,
  getMonitoringParticipantOverview,
  listMonitoringActionRequired,
} from '../services/admin-monitoring-service.js';

function parseFilters(query = {}) {
  return {
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    search: query.search,
    round: query.round,
    status: query.status,
    level: query.level,
    completion: query.completion,
    smartGoalStatus: query.smartGoalStatus,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    shiftType: query.shiftType,
    learningStatus: query.learningStatus,
  };
}

export const getAdminMonitoringOverview = asyncHandler(async (req, res) => {
  const data = await getMonitoringOverview();
  return ok(res, data);
});

export const listAdminMonitoringPsqi = asyncHandler(async (req, res) => {
  const data = await listMonitoringPsqi(parseFilters(req.query));
  return ok(res, data);
});

export const getAdminMonitoringPsqiDetail = asyncHandler(async (req, res) => {
  const data = await getMonitoringPsqiDetail(req.params.userId);
  return ok(res, data);
});

export const listAdminMonitoringSleepDiary = asyncHandler(async (req, res) => {
  const data = await listMonitoringSleepDiary(parseFilters(req.query));
  return ok(res, data);
});

export const getAdminMonitoringSleepDiaryDetail = asyncHandler(async (req, res) => {
  const data = await getMonitoringSleepDiaryDetail(req.params.userId);
  return ok(res, data);
});

export const listAdminMonitoringSmartGoal = asyncHandler(async (req, res) => {
  const filters = parseFilters(req.query);
  const data = await listMonitoringSmartGoal({
    ...filters,
    status: filters.smartGoalStatus,
  });
  return ok(res, data);
});

export const getAdminMonitoringSmartGoalDetail = asyncHandler(async (req, res) => {
  const data = await getMonitoringSmartGoalDetail(req.params.userId);
  return ok(res, data);
});

export const listAdminMonitoringLearning = asyncHandler(async (req, res) => {
  const filters = parseFilters(req.query);
  const data = await listMonitoringLearning({
    ...filters,
    status: filters.learningStatus,
  });
  return ok(res, data);
});

export const getAdminMonitoringLearningDetail = asyncHandler(async (req, res) => {
  const data = await getMonitoringLearningDetail(req.params.userId);
  return ok(res, data);
});

export const getAdminMonitoringParticipantOverview = asyncHandler(async (req, res) => {
  const data = await getMonitoringParticipantOverview(req.params.userId);
  return ok(res, data);
});

export const listAdminMonitoringActionRequired = asyncHandler(async (req, res) => {
  const data = await listMonitoringActionRequired(parseFilters(req.query));
  return ok(res, data);
});
