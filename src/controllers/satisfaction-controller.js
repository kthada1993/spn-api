import ExcelJS from 'exceljs';

import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  getMySatisfactionSurvey,
  submitMySatisfactionSurvey,
  listAdminSatisfactionSurveys,
} from '../services/satisfaction-service.js';
import { validateSatisfactionInput } from '../validators/satisfaction-validator.js';

const exportColumns = [
  ['user_id', 'รหัสผู้ใช้ในระบบ'],
  ['code_id', 'รหัสผู้เข้าร่วม'],
  ['display_name', 'ชื่อผู้เข้าร่วม'],
  ['approval_status', 'สถานะอนุมัติ'],
  ['study_group', 'กลุ่มการศึกษา'],
  ['eligible', 'ถึงเกณฑ์ทำแบบประเมิน'],
  ['has_week8_psqi', 'มี PSQI ครั้งที่ 2 แล้ว'],
  ['week1_assessment_date', 'วันที่ประเมิน PSQI ครั้งที่ 1'],
  ['unlock_date', 'วันครบ 8 สัปดาห์'],
  ['submitted', 'ส่งแบบประเมินแล้ว'],
  ['submitted_at', 'เวลาส่งแบบประเมิน'],
  ['overall_avg', 'คะแนนเฉลี่ยรวม'],
  ['q1_1', '1.1 ความรู้เรื่องสรีรวิทยาการนอน วงจรการนอน และนาฬิกาชีวภาพ'],
  ['q1_2', '1.2 เนื้อหาหลักสุขอนามัยการนอนหลับสำหรับพยาบาลกะ'],
  ['q1_3', '1.3 การสอนและสาธิตเทคนิคการหายใจ 4-7-8'],
  ['q1_4', '1.4 ความรู้เรื่องกลยุทธ์การลดความเสี่ยงด้านสุขภาพสำหรับพยาบาลกะ'],
  ['q1_5', '1.5 ความเหมาะสมและประโยชน์ของ Sleep Diary'],
  ['q2_1', '2.1 คู่มือโปรแกรมมีความชัดเจนและเข้าใจง่าย'],
  ['q2_2', '2.2 สื่อวิดีโอสาธิตเทคนิคการหายใจมีความชัดเจน'],
  ['q2_3', '2.3 ความสะดวกในการติดตามผ่าน LINE Application'],
  ['q2_4', '2.4 การตอบข้อสงสัยและการให้คำปรึกษาจากผู้วิจัย'],
  ['q3_1', '3.1 ระยะเวลาในการเรียนรู้กิจกรรมสัปดาห์ที่ 1 และ 2'],
  ['q3_2', '3.2 ความถี่การติดตามผลสัปดาห์ละ 1 ครั้ง'],
  ['q3_3', '3.3 ภาพรวมระยะเวลาโปรแกรมทั้งหมด 8 สัปดาห์'],
  ['q4_1', '4.1 โปรแกรมช่วยเพิ่มความตระหนักและปรับพฤติกรรมการนอน'],
  ['q4_2', '4.2 เทคนิค 4-7-8 ช่วยผ่อนคลายและเข้าสู่การนอนง่ายขึ้น'],
  ['q4_3', '4.3 นำกลยุทธ์ลดความเสี่ยงไปใช้ตามตารางเวรได้เหมาะสม'],
  ['q4_4', '4.4 ความพึงพอใจภาพรวมต่อโปรแกรม'],
  ['comment_best_activity', 'ข้อคิดเห็น 1 กิจกรรมหรือเทคนิคที่มีประโยชน์ที่สุด'],
  ['comment_barriers', 'ข้อคิดเห็น 2 ปัญหา อุปสรรค หรือความไม่สะดวกที่พบ'],
  ['comment_suggestions', 'ข้อคิดเห็น 3 ข้อเสนอแนะเพื่อปรับปรุงโปรแกรม'],
];

function toExportRows(items = []) {
  return items.map((item) => ({
    user_id: item.user_id,
    code_id: item.code_id,
    display_name: item.display_name,
    approval_status: item.approval_status,
    study_group: item.eligibility?.study_group ?? null,
    eligible: item.eligibility?.eligible ? 'Y' : 'N',
    has_week8_psqi: item.eligibility?.has_week8_psqi ? 'Y' : 'N',
    week1_assessment_date: item.eligibility?.week1_assessment_date || null,
    unlock_date: item.eligibility?.unlock_date || null,
    submitted: item.submitted ? 'Y' : 'N',
    submitted_at: item.submitted_at || null,
    overall_avg: item.overall_avg,
    q1_1: item.survey?.q1_1 ?? null,
    q1_2: item.survey?.q1_2 ?? null,
    q1_3: item.survey?.q1_3 ?? null,
    q1_4: item.survey?.q1_4 ?? null,
    q1_5: item.survey?.q1_5 ?? null,
    q2_1: item.survey?.q2_1 ?? null,
    q2_2: item.survey?.q2_2 ?? null,
    q2_3: item.survey?.q2_3 ?? null,
    q2_4: item.survey?.q2_4 ?? null,
    q3_1: item.survey?.q3_1 ?? null,
    q3_2: item.survey?.q3_2 ?? null,
    q3_3: item.survey?.q3_3 ?? null,
    q4_1: item.survey?.q4_1 ?? null,
    q4_2: item.survey?.q4_2 ?? null,
    q4_3: item.survey?.q4_3 ?? null,
    q4_4: item.survey?.q4_4 ?? null,
    comment_best_activity: item.survey?.comment_best_activity || '',
    comment_barriers: item.survey?.comment_barriers || '',
    comment_suggestions: item.survey?.comment_suggestions || '',
  }));
}

function makeFileName(prefix, ext) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${ext}`;
}

function escapeCsvValue(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[,"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const getMySatisfaction = asyncHandler(async (req, res) => {
  const data = await getMySatisfactionSurvey(req.auth.id);
  return ok(res, data);
});

export const submitMySatisfaction = asyncHandler(async (req, res) => {
  const input = validateSatisfactionInput(req.body);
  const data = await submitMySatisfactionSurvey(req.auth.id, input);
  return ok(res, data);
});

export const listAdminSatisfaction = asyncHandler(async (req, res) => {
  const data = await listAdminSatisfactionSurveys({
    search: req.query.search,
    status: req.query.status,
  });
  return ok(res, data);
});

export const exportAdminSatisfactionExcel = asyncHandler(async (req, res) => {
  const data = await listAdminSatisfactionSurveys({
    search: req.query.search,
    status: req.query.status,
  });

  const rows = toExportRows(data.items || []);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('satisfaction_results');

  sheet.columns = exportColumns.map(([key]) => ({
    header: key,
    key,
    width: Math.max(16, key.length + 3),
  }));
  sheet.addRows(rows);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };

  const dictionary = workbook.addWorksheet('column_dictionary');
  dictionary.columns = [
    { header: 'column_name', key: 'column_name', width: 32 },
    { header: 'description_th', key: 'description_th', width: 68 },
  ];
  dictionary.addRows(exportColumns.map(([column_name, description_th]) => ({ column_name, description_th })));
  dictionary.views = [{ state: 'frozen', ySplit: 1 }];
  dictionary.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${makeFileName('satisfaction-results', 'xlsx')}"`);
  res.setHeader('Content-Length', buffer.length);

  return res.send(Buffer.from(buffer));
});

export const exportAdminSatisfactionCsv = asyncHandler(async (req, res) => {
  const data = await listAdminSatisfactionSurveys({
    search: req.query.search,
    status: req.query.status,
  });

  const rows = toExportRows(data.items || []);
  const headers = exportColumns.map(([key]) => key);
  const csvLines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ];
  const csv = `\uFEFF${csvLines.join('\n')}`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${makeFileName('satisfaction-results', 'csv')}"`);

  return res.status(200).send(csv);
});
