import ExcelJS from 'exceljs';

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
  listMonitoringPsqiRawExport,
  listMonitoringSleepDiaryRawExport,
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

function exportFileName(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.xlsx`;
}

async function sendRawExportExcel(res, {
  fileName,
  dataSheetName,
  dictionarySheetName,
  rows,
  columns,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SPN Monitoring';
  workbook.created = new Date();

  const dataSheet = workbook.addWorksheet(dataSheetName);
  dataSheet.columns = columns.map((column) => ({
    header: column.key,
    key: column.key,
    width: Math.max(14, String(column.key || '').length + 4),
  }));
  dataSheet.addRows(rows);
  dataSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const dictionarySheet = workbook.addWorksheet(dictionarySheetName);
  dictionarySheet.columns = [
    { header: 'column_name', key: 'key', width: 28 },
    { header: 'label_th', key: 'label', width: 34 },
    { header: 'description', key: 'description', width: 56 },
    { header: 'value_mapping', key: 'value_mapping', width: 44 },
  ];
  dictionarySheet.addRows(columns);
  dictionarySheet.views = [{ state: 'frozen', ySplit: 1 }];

  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true };
  const dictionaryHeaderRow = dictionarySheet.getRow(1);
  dictionaryHeaderRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', buffer.length);
  return res.send(Buffer.from(buffer));
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

export const exportAdminMonitoringPsqiRawExcel = asyncHandler(async (req, res) => {
  const { items, columns } = await listMonitoringPsqiRawExport(parseFilters(req.query));

  return sendRawExportExcel(res, {
    fileName: exportFileName('thai-psqi-raw-export'),
    dataSheetName: 'thai_psqi_raw',
    dictionarySheetName: 'column_dictionary',
    rows: items,
    columns,
  });
});

export const exportAdminMonitoringSleepDiaryRawExcel = asyncHandler(async (req, res) => {
  const { items, columns } = await listMonitoringSleepDiaryRawExport(parseFilters(req.query));

  return sendRawExportExcel(res, {
    fileName: exportFileName('sleep-diary-raw-export'),
    dataSheetName: 'sleep_diary_raw',
    dictionarySheetName: 'column_dictionary',
    rows: items,
    columns,
  });
});
