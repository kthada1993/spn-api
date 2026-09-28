import ExcelJS from 'exceljs';

import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  getMyContaminationScreening,
  submitMyContaminationScreening,
  listAdminContaminationScreenings,
} from '../services/contamination-service.js';
import { validateContaminationInput } from '../validators/contamination-validator.js';

const exportColumns = [
  ['user_id', 'รหัสผู้ใช้ในระบบ'],
  ['code_id', 'รหัสผู้เข้าร่วม'],
  ['display_name', 'ชื่อผู้เข้าร่วม'],
  ['approval_status', 'สถานะอนุมัติ'],
  ['study_group', 'กลุ่มการศึกษา'],
  ['eligible', 'ถึงเกณฑ์ทำแบบคัดกรอง'],
  ['has_week8_psqi', 'มี PSQI ครั้งที่ 2 แล้ว'],
  ['week1_assessment_date', 'วันที่ประเมิน PSQI ครั้งที่ 1'],
  ['unlock_date', 'วันครบ 8 สัปดาห์'],
  ['submitted', 'ส่งแบบคัดกรองแล้ว'],
  ['submitted_at', 'เวลาส่งแบบคัดกรอง'],
  ['contamination_flag', 'มีความเสี่ยงการปนเปื้อนข้อมูล'],
  ['q1_received_material', 'ข้อ 1 เคยได้รับเอกสาร/คู่มือ/สื่อความรู้'],
  ['q1_material_detail', 'ข้อ 1 รายละเอียดสื่อที่ได้รับ'],
  ['q2_received_breathing', 'ข้อ 2 เคยได้รับการแนะนำ/สาธิตเทคนิคหายใจ 4-7-8'],
  ['q2_breathing_frequency', 'ข้อ 2 ความถี่ในการฝึกปฏิบัติ'],
  ['q3_received_strategy', 'ข้อ 3 เคยได้รับคำแนะนำกลยุทธ์ลดความเสี่ยง'],
  ['q3_strategy_detail', 'ข้อ 3 รายละเอียดเทคนิคที่นำมาปรับใช้'],
  ['q4_talked_with_experimental', 'ข้อ 4 การพูดคุยกับกลุ่มทดลอง'],
  ['part2_timeframe', 'ช่วงเวลาที่เริ่มได้รับข้อมูล/เทคนิค'],
];

function toDisplayText(value, fallback = '-') {
  if (!value) return fallback;

  const mapper = {
    YES: 'เคย',
    NO: 'ไม่เคย',
    ONCE: 'ฝึกเพียงครั้งเดียว/ลองทำดู',
    SOMETIMES: 'ฝึกเป็นบางครั้ง (น้อยกว่า 3 วัน/สัปดาห์)',
    REGULAR: 'ฝึกเป็นประจำ (3 วัน/สัปดาห์ ขึ้นไป)',
    NEVER: 'ไม่เคย',
    LITTLE: 'เคยพูดคุยเล็กน้อย (ไม่มีการนำเทคนิคมาใช้)',
    TRANSFERRED: 'เคยพูดคุย และได้รับการถ่ายทอดเทคนิค/เนื้อหาโปรแกรมมาใช้ปฏิบัติตัว',
    WEEK1_2: 'ช่วงสัปดาห์ที่ 1-2',
    WEEK3_5: 'ช่วงสัปดาห์ที่ 3-5',
    WEEK6_8: 'ช่วงสัปดาห์ที่ 6-8',
  };

  return mapper[value] || value;
}

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
    contamination_flag: item.contamination_flag ? 'Y' : 'N',
    q1_received_material: toDisplayText(item.screening?.q1_received_material),
    q1_material_detail: item.screening?.q1_material_detail || '',
    q2_received_breathing: toDisplayText(item.screening?.q2_received_breathing),
    q2_breathing_frequency: toDisplayText(item.screening?.q2_breathing_frequency),
    q3_received_strategy: toDisplayText(item.screening?.q3_received_strategy),
    q3_strategy_detail: item.screening?.q3_strategy_detail || '',
    q4_talked_with_experimental: toDisplayText(item.screening?.q4_talked_with_experimental),
    part2_timeframe: toDisplayText(item.screening?.part2_timeframe),
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

export const getMyContamination = asyncHandler(async (req, res) => {
  const data = await getMyContaminationScreening(req.auth.id);
  return ok(res, data);
});

export const submitMyContamination = asyncHandler(async (req, res) => {
  const input = validateContaminationInput(req.body);
  const data = await submitMyContaminationScreening(req.auth.id, input);
  return ok(res, data);
});

export const listAdminContamination = asyncHandler(async (req, res) => {
  const data = await listAdminContaminationScreenings({
    search: req.query.search,
    status: req.query.status,
  });
  return ok(res, data);
});

export const exportAdminContaminationExcel = asyncHandler(async (req, res) => {
  const data = await listAdminContaminationScreenings({
    search: req.query.search,
    status: req.query.status,
  });

  const rows = toExportRows(data.items || []);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('contamination_screening');

  sheet.columns = exportColumns.map(([key]) => ({
    header: key,
    key,
    width: Math.max(18, key.length + 3),
  }));
  sheet.addRows(rows);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };

  const dictionary = workbook.addWorksheet('column_dictionary');
  dictionary.columns = [
    { header: 'column_name', key: 'column_name', width: 40 },
    { header: 'description_th', key: 'description_th', width: 78 },
  ];
  dictionary.addRows(exportColumns.map(([column_name, description_th]) => ({ column_name, description_th })));
  dictionary.views = [{ state: 'frozen', ySplit: 1 }];
  dictionary.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${makeFileName('contamination-screening', 'xlsx')}"`);
  res.setHeader('Content-Length', buffer.length);

  return res.send(Buffer.from(buffer));
});

export const exportAdminContaminationCsv = asyncHandler(async (req, res) => {
  const data = await listAdminContaminationScreenings({
    search: req.query.search,
    status: req.query.status,
  });

  const rows = toExportRows(data.items || []);
  const headers = exportColumns.map(([key]) => key);
  const csvLines = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${makeFileName('contamination-screening', 'csv')}"`);

  return res.status(200).send(`\uFEFF${csvLines.join('\n')}`);
});
