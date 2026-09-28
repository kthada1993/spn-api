import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

const SCREENING_UNLOCK_DAYS = 56;

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const base = new Date(`${dateString}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEligibility(row, submitted) {
  const studyGroup = row?.study_group == null ? null : Number(row.study_group);
  const approved = (row?.approval_status || 'PENDING') === 'APPROVED';
  const week1Date = toDateOnly(row?.week1_assessment_date);
  const hasWeek8Psqi = Number(row?.has_week8_psqi || 0) === 1;
  const unlockDate = week1Date ? addDays(week1Date, SCREENING_UNLOCK_DAYS) : null;
  const eligibleByWeeks = Boolean(unlockDate && todayDateOnly() >= unlockDate);

  const isControl = studyGroup === 1;
  const passesRule = hasWeek8Psqi || eligibleByWeeks;
  const eligible = approved && isControl && passesRule;

  return {
    approved,
    study_group: studyGroup,
    is_control_group: isControl,
    has_week8_psqi: hasWeek8Psqi,
    week1_assessment_date: week1Date,
    unlock_date: unlockDate,
    eligible_by_weeks: eligibleByWeeks,
    eligible,
    submitted,
  };
}

function toBoolFromYesNo(value) {
  return String(value || '').toUpperCase() === 'YES';
}

function normalizeContaminationRecord(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    week1_assessment_date: toDateOnly(row.week1_assessment_date),
    submitted_at: row.submitted_at,
    q1_received_material: row.q1_received_material ? 'YES' : 'NO',
    q1_material_detail: row.q1_material_detail || '',
    q2_received_breathing: row.q2_received_breathing ? 'YES' : 'NO',
    q2_breathing_frequency: row.q2_breathing_frequency || null,
    q3_received_strategy: row.q3_received_strategy ? 'YES' : 'NO',
    q3_strategy_detail: row.q3_strategy_detail || '',
    q4_talked_with_experimental: row.q4_talked_with_experimental,
    part2_timeframe: row.part2_timeframe || null,
  };
}

function hasContamination(record) {
  if (!record) return false;

  return (
    record.q1_received_material === 'YES' ||
    record.q2_received_breathing === 'YES' ||
    record.q3_received_strategy === 'YES' ||
    record.q4_talked_with_experimental !== 'NEVER'
  );
}

async function getUserScreeningRecord(userId) {
  const rows = await query(
    `
      SELECT
        id,
        user_id,
        week1_assessment_date,
        submitted_at,
        q1_received_material,
        q1_material_detail,
        q2_received_breathing,
        q2_breathing_frequency,
        q3_received_strategy,
        q3_strategy_detail,
        q4_talked_with_experimental,
        part2_timeframe
      FROM user_contamination_screenings
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  return normalizeContaminationRecord(rows[0] || null);
}

async function getUserEligibilitySource(userId) {
  const rows = await query(
    `
      SELECT
        u.id,
        u.approval_status,
        s.study_group,
        a1.assessment_date AS week1_assessment_date,
        CASE WHEN a8.id IS NULL THEN 0 ELSE 1 END AS has_week8_psqi
      FROM users u
      LEFT JOIN user_screenings s ON s.user_id = u.id
      LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
      LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId]
  );

  if (!rows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  return rows[0];
}

export async function getMyContaminationScreening(userId) {
  const [eligibilitySource, record] = await Promise.all([
    getUserEligibilitySource(userId),
    getUserScreeningRecord(userId),
  ]);

  const eligibility = normalizeEligibility(eligibilitySource, Boolean(record));

  return {
    eligibility,
    screening: record,
    contamination_flag: hasContamination(record),
  };
}

export async function submitMyContaminationScreening(userId, input) {
  const [eligibilitySource, existing] = await Promise.all([
    getUserEligibilitySource(userId),
    getUserScreeningRecord(userId),
  ]);

  if (existing) {
    throw new AppError(409, 'CONTAMINATION_ALREADY_SUBMITTED', 'ท่านได้ส่งแบบคัดกรองการปนเปื้อนข้อมูลแล้ว');
  }

  const eligibility = normalizeEligibility(eligibilitySource, false);

  if (!eligibility.is_control_group) {
    throw new AppError(403, 'CONTAMINATION_CONTROL_ONLY', 'แบบคัดกรองนี้สำหรับกลุ่มควบคุมเท่านั้น');
  }

  if (!eligibility.eligible) {
    throw new AppError(
      403,
      'CONTAMINATION_NOT_ELIGIBLE_YET',
      'ยังไม่ถึงเกณฑ์การคัดกรองการปนเปื้อนข้อมูล (หลัง PSQI ครั้งที่ 2 หรือครบ 8 สัปดาห์)'
    );
  }

  await query(
    `
      INSERT INTO user_contamination_screenings (
        user_id,
        week1_assessment_date,
        q1_received_material,
        q1_material_detail,
        q2_received_breathing,
        q2_breathing_frequency,
        q3_received_strategy,
        q3_strategy_detail,
        q4_talked_with_experimental,
        part2_timeframe
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      eligibility.week1_assessment_date,
      toBoolFromYesNo(input.q1_received_material) ? 1 : 0,
      input.q1_material_detail || null,
      toBoolFromYesNo(input.q2_received_breathing) ? 1 : 0,
      input.q2_breathing_frequency || null,
      toBoolFromYesNo(input.q3_received_strategy) ? 1 : 0,
      input.q3_strategy_detail || null,
      input.q4_talked_with_experimental,
      input.part2_timeframe || null,
    ]
  );

  return getMyContaminationScreening(userId);
}

export async function listAdminContaminationScreenings(filters = {}) {
  const search = String(filters.search || '').trim();
  const status = String(filters.status || 'ALL').toUpperCase();

  const where = ['s.study_group = 1'];
  const params = [];

  if (search) {
    where.push('(u.code_id LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status === 'SUBMITTED') {
    where.push('cs.id IS NOT NULL');
  }

  if (status === 'PENDING') {
    where.push('cs.id IS NULL');
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = await query(
    `
      SELECT
        u.id AS user_id,
        u.code_id,
        u.display_name,
        u.approval_status,
        s.study_group,
        a1.assessment_date AS week1_assessment_date,
        CASE WHEN a8.id IS NULL THEN 0 ELSE 1 END AS has_week8_psqi,
        cs.id AS screening_id,
        cs.submitted_at,
        cs.q1_received_material,
        cs.q1_material_detail,
        cs.q2_received_breathing,
        cs.q2_breathing_frequency,
        cs.q3_received_strategy,
        cs.q3_strategy_detail,
        cs.q4_talked_with_experimental,
        cs.part2_timeframe
      FROM users u
      INNER JOIN user_screenings s ON s.user_id = u.id
      LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
      LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
      LEFT JOIN user_contamination_screenings cs ON cs.user_id = u.id
      ${whereClause}
      ORDER BY cs.submitted_at DESC, u.id DESC
    `,
    params
  );

  const items = rows.map((row) => {
    const eligibility = normalizeEligibility(row, Boolean(row.screening_id));
    const screening = row.screening_id
      ? normalizeContaminationRecord({
          id: row.screening_id,
          user_id: row.user_id,
          week1_assessment_date: row.week1_assessment_date,
          submitted_at: row.submitted_at,
          q1_received_material: row.q1_received_material,
          q1_material_detail: row.q1_material_detail,
          q2_received_breathing: row.q2_received_breathing,
          q2_breathing_frequency: row.q2_breathing_frequency,
          q3_received_strategy: row.q3_received_strategy,
          q3_strategy_detail: row.q3_strategy_detail,
          q4_talked_with_experimental: row.q4_talked_with_experimental,
          part2_timeframe: row.part2_timeframe,
        })
      : null;

    return {
      user_id: Number(row.user_id),
      code_id: row.code_id,
      display_name: row.display_name,
      approval_status: row.approval_status,
      eligibility,
      submitted: Boolean(row.screening_id),
      submitted_at: row.submitted_at || null,
      contamination_flag: hasContamination(screening),
      screening,
    };
  });

  const submittedCount = items.filter((item) => item.submitted).length;
  const contaminationCount = items.filter((item) => item.contamination_flag).length;

  return {
    items,
    summary: {
      participants_total: items.length,
      submitted: submittedCount,
      pending: items.length - submittedCount,
      contamination_detected: contaminationCount,
    },
  };
}
