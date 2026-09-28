import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

const SURVEY_UNLOCK_DAYS = 56;

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
  const unlockDate = week1Date ? addDays(week1Date, SURVEY_UNLOCK_DAYS) : null;
  const eligibleByWeeks = Boolean(unlockDate && todayDateOnly() >= unlockDate);

  const isExperimental = studyGroup === 2;
  const passesRule = hasWeek8Psqi || eligibleByWeeks;
  const eligible = approved && isExperimental && passesRule;

  return {
    approved,
    study_group: studyGroup,
    is_experimental_group: isExperimental,
    has_week8_psqi: hasWeek8Psqi,
    week1_assessment_date: week1Date,
    unlock_date: unlockDate,
    eligible_by_weeks: eligibleByWeeks,
    eligible,
    submitted,
  };
}

async function getUserSurveyRecord(userId) {
  const rows = await query(
    `
      SELECT
        id,
        user_id,
        week1_assessment_date,
        submitted_at,
        q1_1,
        q1_2,
        q1_3,
        q1_4,
        q1_5,
        q2_1,
        q2_2,
        q2_3,
        q2_4,
        q3_1,
        q3_2,
        q3_3,
        q4_1,
        q4_2,
        q4_3,
        q4_4,
        comment_best_activity,
        comment_barriers,
        comment_suggestions
      FROM user_satisfaction_surveys
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
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

function calculateSectionAverages(record) {
  if (!record) return null;

  const sec1 = [record.q1_1, record.q1_2, record.q1_3, record.q1_4, record.q1_5].map(Number);
  const sec2 = [record.q2_1, record.q2_2, record.q2_3, record.q2_4].map(Number);
  const sec3 = [record.q3_1, record.q3_2, record.q3_3].map(Number);
  const sec4 = [record.q4_1, record.q4_2, record.q4_3, record.q4_4].map(Number);

  const avg = (values) => Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));

  return {
    section1_avg: avg(sec1),
    section2_avg: avg(sec2),
    section3_avg: avg(sec3),
    section4_avg: avg(sec4),
    overall_avg: avg([...sec1, ...sec2, ...sec3, ...sec4]),
  };
}

export async function getMySatisfactionSurvey(userId) {
  const [eligibilitySource, record] = await Promise.all([
    getUserEligibilitySource(userId),
    getUserSurveyRecord(userId),
  ]);

  const eligibility = normalizeEligibility(eligibilitySource, Boolean(record));
  const metrics = calculateSectionAverages(record);

  return {
    eligibility,
    survey: record,
    metrics,
  };
}

export async function submitMySatisfactionSurvey(userId, input) {
  const [eligibilitySource, existing] = await Promise.all([
    getUserEligibilitySource(userId),
    getUserSurveyRecord(userId),
  ]);

  if (existing) {
    throw new AppError(409, 'SATISFACTION_ALREADY_SUBMITTED', 'ท่านได้ส่งแบบประเมินความพึงพอใจแล้ว');
  }

  const eligibility = normalizeEligibility(eligibilitySource, false);

  if (!eligibility.is_experimental_group) {
    throw new AppError(403, 'SATISFACTION_EXPERIMENTAL_ONLY', 'แบบประเมินนี้สำหรับกลุ่มทดลองเท่านั้น');
  }

  if (!eligibility.eligible) {
    throw new AppError(
      403,
      'SATISFACTION_NOT_ELIGIBLE_YET',
      'ยังไม่ถึงเกณฑ์การประเมินความพึงพอใจ (หลัง PSQI ครั้งที่ 2 หรือครบ 8 สัปดาห์)'
    );
  }

  await query(
    `
      INSERT INTO user_satisfaction_surveys (
        user_id,
        week1_assessment_date,
        q1_1,
        q1_2,
        q1_3,
        q1_4,
        q1_5,
        q2_1,
        q2_2,
        q2_3,
        q2_4,
        q3_1,
        q3_2,
        q3_3,
        q4_1,
        q4_2,
        q4_3,
        q4_4,
        comment_best_activity,
        comment_barriers,
        comment_suggestions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      eligibility.week1_assessment_date,
      input.q1_1,
      input.q1_2,
      input.q1_3,
      input.q1_4,
      input.q1_5,
      input.q2_1,
      input.q2_2,
      input.q2_3,
      input.q2_4,
      input.q3_1,
      input.q3_2,
      input.q3_3,
      input.q4_1,
      input.q4_2,
      input.q4_3,
      input.q4_4,
      input.comment_best_activity,
      input.comment_barriers,
      input.comment_suggestions,
    ]
  );

  return getMySatisfactionSurvey(userId);
}

export async function listAdminSatisfactionSurveys(filters = {}) {
  const search = String(filters.search || '').trim();
  const status = String(filters.status || 'ALL').toUpperCase();

  const where = ['s.study_group = 2'];
  const params = [];

  if (search) {
    where.push('(u.code_id LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status === 'SUBMITTED') {
    where.push('sv.id IS NOT NULL');
  }

  if (status === 'PENDING') {
    where.push('sv.id IS NULL');
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
        sv.id AS survey_id,
        sv.submitted_at,
        sv.q1_1,
        sv.q1_2,
        sv.q1_3,
        sv.q1_4,
        sv.q1_5,
        sv.q2_1,
        sv.q2_2,
        sv.q2_3,
        sv.q2_4,
        sv.q3_1,
        sv.q3_2,
        sv.q3_3,
        sv.q4_1,
        sv.q4_2,
        sv.q4_3,
        sv.q4_4,
        sv.comment_best_activity,
        sv.comment_barriers,
        sv.comment_suggestions
      FROM users u
      INNER JOIN user_screenings s ON s.user_id = u.id
      LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
      LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
      LEFT JOIN user_satisfaction_surveys sv ON sv.user_id = u.id
      ${whereClause}
      ORDER BY sv.submitted_at DESC, u.id DESC
    `,
    params
  );

  const items = rows.map((row) => {
    const eligibility = normalizeEligibility(row, Boolean(row.survey_id));
    const sectionValues = row.survey_id
      ? [
          Number(row.q1_1), Number(row.q1_2), Number(row.q1_3), Number(row.q1_4), Number(row.q1_5),
          Number(row.q2_1), Number(row.q2_2), Number(row.q2_3), Number(row.q2_4),
          Number(row.q3_1), Number(row.q3_2), Number(row.q3_3),
          Number(row.q4_1), Number(row.q4_2), Number(row.q4_3), Number(row.q4_4),
        ]
      : [];

    const overallAvg = sectionValues.length
      ? Number((sectionValues.reduce((sum, value) => sum + value, 0) / sectionValues.length).toFixed(2))
      : null;

    return {
      user_id: Number(row.user_id),
      code_id: row.code_id,
      display_name: row.display_name,
      approval_status: row.approval_status,
      eligibility,
      submitted: Boolean(row.survey_id),
      submitted_at: row.submitted_at || null,
      overall_avg: overallAvg,
      survey: row.survey_id
        ? {
            q1_1: Number(row.q1_1),
            q1_2: Number(row.q1_2),
            q1_3: Number(row.q1_3),
            q1_4: Number(row.q1_4),
            q1_5: Number(row.q1_5),
            q2_1: Number(row.q2_1),
            q2_2: Number(row.q2_2),
            q2_3: Number(row.q2_3),
            q2_4: Number(row.q2_4),
            q3_1: Number(row.q3_1),
            q3_2: Number(row.q3_2),
            q3_3: Number(row.q3_3),
            q4_1: Number(row.q4_1),
            q4_2: Number(row.q4_2),
            q4_3: Number(row.q4_3),
            q4_4: Number(row.q4_4),
            comment_best_activity: row.comment_best_activity || '',
            comment_barriers: row.comment_barriers || '',
            comment_suggestions: row.comment_suggestions || '',
          }
        : null,
    };
  });

  const submittedCount = items.filter((item) => item.submitted).length;

  return {
    items,
    summary: {
      participants_total: items.length,
      submitted: submittedCount,
      pending: items.length - submittedCount,
    },
  };
}
