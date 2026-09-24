import { env } from '../config/env.js';
import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

const DEFAULT_LIMIT = 20;
const ALLOWED_LIMITS = [20, 50, 100];

const ROUND2_WAIT_DAYS = Number.isFinite(Number(env.MONITORING_ROUND2_WAIT_DAYS))
  ? Math.max(1, Number(env.MONITORING_ROUND2_WAIT_DAYS))
  : 49;
const FOLLOWUP_PSQI_THRESHOLD = Number.isFinite(Number(env.MONITORING_PSQI_HIGH_THRESHOLD))
  ? Math.max(1, Number(env.MONITORING_PSQI_HIGH_THRESHOLD))
  : 10;
const FOLLOWUP_DIARY_SE_THRESHOLD = Number.isFinite(Number(env.MONITORING_DIARY_SE_THRESHOLD))
  ? Math.max(1, Number(env.MONITORING_DIARY_SE_THRESHOLD))
  : 80;
const FOLLOWUP_DIARY_MISSING_DAYS_THRESHOLD = Number.isFinite(
  Number(env.MONITORING_DIARY_MISSING_DAYS_THRESHOLD)
)
  ? Math.max(1, Number(env.MONITORING_DIARY_MISSING_DAYS_THRESHOLD))
  : 3;

const PSQI_STATUS = {
  NOT_STARTED: 'ยังไม่ทำ',
  DONE_WEEK1: 'ทำแล้ว',
  WAITING_WEEK8: 'รอ Week 8',
  COMPLETED: 'Completed',
};

const PSQI_LEVEL = {
  GOOD: 'ดี',
  PROBLEM: 'มีปัญหา',
  SEVERE: 'แย่มาก',
  UNKNOWN: '-',
};

const DIARY_STATUS = {
  NOT_STARTED: 'ยังไม่เริ่ม',
  IN_PROGRESS: 'กำลังดำเนินการ',
  ACTION_REQUIRED: 'ต้องติดตาม',
  COMPLETED: 'Completed',
};

const LESSON_TOTAL = 4;
const INTRO_UNLOCK_PERCENT = 90;

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseTimeToMinutes(value) {
  const [hourRaw, minuteRaw] = String(value || '').split(':');
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

function minutesDiffCrossMidnight(start, end) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  return endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : 24 * 60 - startMinutes + endMinutes;
}

function minutesDistanceCircular(aMinutes, bMinutes) {
  const direct = Math.abs(aMinutes - bMinutes);
  return Math.min(direct, 24 * 60 - direct);
}

function normalizePagination(input = {}) {
  const pageRaw = Number(input.page);
  const limitRaw = Number(input.limit);

  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = ALLOWED_LIMITS.includes(limitRaw) ? limitRaw : DEFAULT_LIMIT;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function normalizeSort(input = {}, map = {}, fallbackField = 'created_at') {
  const sortBy = map[input.sortBy] || map[fallbackField] || fallbackField;
  const sortOrder = String(input.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return { sortBy, sortOrder };
}

function parseUserId(input) {
  const userId = Number(input);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid user id');
  }
  return userId;
}

function psqiLevelCode(score) {
  if (score == null) return 'UNKNOWN';
  if (score <= 5) return 'GOOD';
  if (score <= 10) return 'PROBLEM';
  return 'SEVERE';
}

function psqiLevelLabel(score) {
  const code = psqiLevelCode(score);
  return PSQI_LEVEL[code] || PSQI_LEVEL.UNKNOWN;
}

function psqiStatusLabel(code) {
  return PSQI_STATUS[code] || '-';
}

function diaryStatusLabel(code) {
  return DIARY_STATUS[code] || '-';
}

function learningStatusCode(progress) {
  if (!progress?.intro_unlocked) return 'INTRO_PENDING';
  if (Number(progress.completed_lessons || 0) >= LESSON_TOTAL) return 'COMPLETED';
  if (Number(progress.completed_lessons || 0) > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
}

function learningStatusLabel(code) {
  if (code === 'INTRO_PENDING') return 'รอดูวิดีโอแนะนำ';
  if (code === 'IN_PROGRESS') return 'กำลังเรียน';
  if (code === 'COMPLETED') return 'เรียนครบแล้ว';
  return 'ยังไม่เริ่ม';
}

async function getUsersLearningProgressMap(userIds = []) {
  const ids = [...new Set(userIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))];
  const result = new Map();

  if (!ids.length) {
    return result;
  }

  const placeholders = ids.map(() => '?').join(', ');

  const introRows = await query(
    `
      SELECT user_id, watched_percent, unlocked, last_watched_at, completed_at
      FROM learning_intro_progress
      WHERE user_id IN (${placeholders})
    `,
    ids
  );

  const lessonRows = await query(
    `
      SELECT user_id, lesson_key, video_watched_percent, video_completed, pdf_opened, is_completed, updated_at
      FROM learning_lesson_progress
      WHERE user_id IN (${placeholders})
    `,
    ids
  );

  const quizRows = await query(
    `
      SELECT q.*
      FROM learning_quiz_attempts q
      INNER JOIN (
        SELECT user_id, quiz_type, MAX(id) AS max_id
        FROM learning_quiz_attempts
        WHERE user_id IN (${placeholders})
        GROUP BY user_id, quiz_type
      ) x ON x.max_id = q.id
    `,
    ids
  );

  for (const userId of ids) {
    result.set(userId, {
      intro_percent: 0,
      intro_unlocked: false,
      intro_completed_at: null,
      completed_lessons: 0,
      total_lessons: LESSON_TOTAL,
      lesson_completion_percent: 0,
      last_activity_at: null,
      lessons: [],
      quiz: {
        pretest: null,
        posttest: null,
      },
    });
  }

  for (const row of introRows) {
    const userId = Number(row.user_id);
    const state = result.get(userId);
    if (!state) continue;

    const introPercent = toNumberOrNull(row.watched_percent) ?? 0;
    state.intro_percent = Math.max(0, Math.min(100, Number(introPercent.toFixed(1))));
    state.intro_unlocked = state.intro_percent >= INTRO_UNLOCK_PERCENT || Number(row.unlocked || 0) === 1;
    state.intro_completed_at = row.completed_at || null;
    state.last_activity_at = row.last_watched_at || state.last_activity_at;
  }

  for (const row of lessonRows) {
    const userId = Number(row.user_id);
    const state = result.get(userId);
    if (!state) continue;

    const completed = Number(row.is_completed || 0) === 1;
    if (completed) {
      state.completed_lessons += 1;
    }

    state.lessons.push({
      lesson_key: row.lesson_key,
      video_watched_percent: toNumberOrNull(row.video_watched_percent) ?? 0,
      video_completed: Number(row.video_completed || 0) === 1,
      pdf_opened: Number(row.pdf_opened || 0) === 1,
      is_completed: completed,
      updated_at: row.updated_at || null,
    });

    if (!state.last_activity_at || (row.updated_at && new Date(row.updated_at) > new Date(state.last_activity_at))) {
      state.last_activity_at = row.updated_at || state.last_activity_at;
    }
  }

  for (const row of quizRows) {
    const userId = Number(row.user_id);
    const state = result.get(userId);
    if (!state) continue;

    const payload = {
      score: Number(row.score || 0),
      total_questions: Number(row.total_questions || 10),
      percent: toNumberOrNull(row.percent) ?? 0,
      submitted_at: row.submitted_at || null,
      result: (() => {
        try {
          return JSON.parse(row.result_json || '[]');
        } catch {
          return [];
        }
      })(),
    };

    if (row.quiz_type === 'PRETEST') {
      state.quiz.pretest = payload;
    }
    if (row.quiz_type === 'POSTTEST') {
      state.quiz.posttest = payload;
    }

    if (!state.last_activity_at || (row.submitted_at && new Date(row.submitted_at) > new Date(state.last_activity_at))) {
      state.last_activity_at = row.submitted_at || state.last_activity_at;
    }
  }

  for (const [, state] of result) {
    state.lesson_completion_percent =
      state.total_lessons > 0
        ? Number(((state.completed_lessons / state.total_lessons) * 100).toFixed(1))
        : 0;
  }

  return result;
}

function normalizeSmartGoal(goal) {
  if (!goal) return null;

  return {
    id: goal.id,
    session_id: goal.session_id,
    user_id: goal.user_id,
    sleep_hours_target: Number(goal.sleep_hours_target),
    night_shift_nap_minutes_target: Number(goal.night_shift_nap_minutes_target),
    breathing_frequency_days: Number(goal.breathing_frequency_days),
    breathing_time: String(goal.breathing_time || '').slice(0, 5),
    caffeine_cutoff_hours: Number(goal.caffeine_cutoff_hours),
    bedroom_adjustment_plan: goal.bedroom_adjustment_plan || '',
  };
}

function evaluateSmartGoalForRecord(goal, record) {
  if (!goal || !record) return null;

  const bedtime = String(record.bedtime || '').slice(0, 5);
  const lastCaffeineTime = String(record.last_caffeine_time || '').slice(0, 5) || null;
  const breathingTime = String(record.breathing_478_time || '').slice(0, 5) || null;
  const breathingGoalTime = String(goal.breathing_time || '').slice(0, 5) || null;

  const sleepHoursGoalMinutes = Math.round(Number(goal.sleep_hours_target || 0) * 60);
  const sleepHoursAchieved = Number(record.tst_minutes || 0) >= sleepHoursGoalMinutes;

  const napTarget = Number(goal.night_shift_nap_minutes_target || 0);
  const napApplicable = record.shift_type === 'NIGHT';
  const napAchieved = napApplicable
    ? napTarget <= 0 || (Number(record.nap) === 1 && Number(record.nap_minutes || 0) >= napTarget)
    : null;

  const breathingFrequency = Math.max(1, Number(goal.breathing_frequency_days || 1));
  const breathingDue = (Number(record.day_number) - 1) % breathingFrequency === 0;
  let breathingAchieved = null;

  if (breathingDue) {
    if (Number(record.breathing_478) !== 1) {
      breathingAchieved = false;
    } else if (!breathingGoalTime || !breathingTime) {
      breathingAchieved = Number(record.breathing_478) === 1;
    } else {
      const goalMinutes = parseTimeToMinutes(breathingGoalTime);
      const doneMinutes = parseTimeToMinutes(breathingTime);
      breathingAchieved = minutesDistanceCircular(goalMinutes, doneMinutes) <= 120;
    }
  }

  const caffeineCutoffMinutes = Math.round(Number(goal.caffeine_cutoff_hours || 0) * 60);
  let caffeineAchieved = false;

  if (Number(record.caffeine_cups || 0) === 0) {
    caffeineAchieved = true;
  } else if (lastCaffeineTime && bedtime) {
    const diffMinutes = minutesDiffCrossMidnight(lastCaffeineTime, bedtime);
    caffeineAchieved = diffMinutes >= caffeineCutoffMinutes;
  }

  const bedroomAchieved = Number(record.bedroom_adjustment_done) === 1;

  const checks = [
    { key: 'sleep_hours', label: 'นอนตามชั่วโมงเป้าหมาย', applicable: true, achieved: sleepHoursAchieved },
    {
      key: 'night_shift_nap',
      label: 'งีบก่อนกะดึกตามเป้าหมาย',
      applicable: napApplicable,
      achieved: napAchieved,
    },
    {
      key: 'breathing_478_schedule',
      label: 'ฝึกหายใจ 4-7-8 ตามรอบ',
      applicable: breathingDue,
      achieved: breathingAchieved,
    },
    {
      key: 'caffeine_cutoff',
      label: 'หยุดคาเฟอีนก่อนนอนตามชั่วโมงเป้าหมาย',
      applicable: true,
      achieved: caffeineAchieved,
    },
    {
      key: 'bedroom_adjustment',
      label: 'ปรับห้องนอนตามแผนที่ตั้งไว้',
      applicable: true,
      achieved: bedroomAchieved,
    },
  ];

  const applicableCount = checks.filter((item) => item.applicable).length;
  const achievedCount = checks.filter((item) => item.applicable && item.achieved === true).length;

  return {
    applicable_count: applicableCount,
    achieved_count: achievedCount,
    achieved_ratio: applicableCount > 0 ? Number(((achievedCount / applicableCount) * 100).toFixed(1)) : 0,
    checks,
  };
}

function summarizeSmartGoal(records, goal) {
  if (!goal) {
    return {
      configured: false,
      goal: null,
      achieved_any_goal_days: 0,
      achieved_all_applicable_goal_days: 0,
      overall_adherence_percent: null,
      by_goal: [],
    };
  }

  const totals = {
    sleep_hours: { achieved_days: 0, applicable_days: 0, label: 'นอนตามชั่วโมงเป้าหมาย' },
    night_shift_nap: { achieved_days: 0, applicable_days: 0, label: 'งีบก่อนกะดึกตามเป้าหมาย' },
    breathing_478_schedule: { achieved_days: 0, applicable_days: 0, label: 'ฝึกหายใจ 4-7-8 ตามรอบ' },
    caffeine_cutoff: {
      achieved_days: 0,
      applicable_days: 0,
      label: 'หยุดคาเฟอีนก่อนนอนตามชั่วโมงเป้าหมาย',
    },
    bedroom_adjustment: { achieved_days: 0, applicable_days: 0, label: 'ปรับห้องนอนตามแผนที่ตั้งไว้' },
  };

  let achievedAnyGoalDays = 0;
  let achievedAllApplicableGoalDays = 0;
  let achievedChecks = 0;
  let applicableChecks = 0;

  for (const record of records) {
    const daily = evaluateSmartGoalForRecord(goal, record);
    if (!daily) continue;

    if (daily.achieved_count > 0) achievedAnyGoalDays += 1;
    if (daily.applicable_count > 0 && daily.achieved_count === daily.applicable_count) {
      achievedAllApplicableGoalDays += 1;
    }

    achievedChecks += daily.achieved_count;
    applicableChecks += daily.applicable_count;

    for (const check of daily.checks) {
      if (!check.applicable || !totals[check.key]) continue;
      totals[check.key].applicable_days += 1;
      if (check.achieved === true) {
        totals[check.key].achieved_days += 1;
      }
    }
  }

  const byGoal = Object.entries(totals).map(([key, value]) => ({
    key,
    label: value.label,
    achieved_days: value.achieved_days,
    applicable_days: value.applicable_days,
    achieved_ratio:
      value.applicable_days > 0
        ? Number(((value.achieved_days / value.applicable_days) * 100).toFixed(1))
        : 0,
  }));

  return {
    configured: true,
    goal,
    achieved_any_goal_days: achievedAnyGoalDays,
    achieved_all_applicable_goal_days: achievedAllApplicableGoalDays,
    overall_adherence_percent:
      applicableChecks > 0 ? Number(((achievedChecks / applicableChecks) * 100).toFixed(1)) : null,
    by_goal: byGoal,
  };
}

function trendCode(w1, w8) {
  if (w1 == null || w8 == null) return 'NO_DATA';
  const diff = Number(w8) - Number(w1);
  if (diff < 0) return 'IMPROVED';
  if (diff > 0) return 'WORSE';
  return 'UNCHANGED';
}

function trendLabel(code) {
  if (code === 'IMPROVED') return 'ดีขึ้น';
  if (code === 'WORSE') return 'แย่ลง';
  if (code === 'UNCHANGED') return 'ไม่เปลี่ยนแปลง';
  return '-';
}

function psqiBaseQuery() {
  return `
    FROM users u
    LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
    LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
  `;
}

function psqiSelectFields() {
  return `
    u.id,
    u.code_id,
    u.display_name,
    a1.assessment_date AS week1_date,
    a1.total_score AS week1_score,
    a1.component_1 AS week1_component_1,
    a1.component_2 AS week1_component_2,
    a1.component_3 AS week1_component_3,
    a1.component_4 AS week1_component_4,
    a1.component_5 AS week1_component_5,
    a1.component_6 AS week1_component_6,
    a1.component_7 AS week1_component_7,
    a8.assessment_date AS week8_date,
    a8.total_score AS week8_score,
    a8.component_1 AS week8_component_1,
    a8.component_2 AS week8_component_2,
    a8.component_3 AS week8_component_3,
    a8.component_4 AS week8_component_4,
    a8.component_5 AS week8_component_5,
    a8.component_6 AS week8_component_6,
    a8.component_7 AS week8_component_7,
    CASE
      WHEN a8.total_score IS NOT NULL THEN a8.total_score
      WHEN a1.total_score IS NOT NULL THEN a1.total_score
      ELSE NULL
    END AS latest_psqi,
    CASE
      WHEN a1.id IS NULL THEN 'NOT_STARTED'
      WHEN a8.id IS NOT NULL THEN 'COMPLETED'
      WHEN DATE_ADD(a1.assessment_date, INTERVAL ${ROUND2_WAIT_DAYS} DAY) <= CURDATE() THEN 'WAITING_WEEK8'
      ELSE 'DONE_WEEK1'
    END AS status_code,
    CASE
      WHEN a8.total_score IS NOT NULL AND a1.total_score IS NOT NULL THEN (CAST(a8.total_score AS SIGNED) - CAST(a1.total_score AS SIGNED))
      ELSE NULL
    END AS change_score
  `;
}

function appendPsqiFilters(whereParts, params, filters = {}) {
  const search = String(filters.search || '').trim();
  if (search) {
    whereParts.push('(u.code_id LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.round === 'WEEK_1') {
    whereParts.push('a1.id IS NOT NULL');
  }

  if (filters.round === 'WEEK_8') {
    whereParts.push('a8.id IS NOT NULL');
  }

  if (filters.status === 'NOT_STARTED') {
    whereParts.push('a1.id IS NULL');
  }

  if (filters.status === 'DONE_WEEK1') {
    whereParts.push(`a1.id IS NOT NULL AND a8.id IS NULL AND DATE_ADD(a1.assessment_date, INTERVAL ${ROUND2_WAIT_DAYS} DAY) > CURDATE()`);
  }

  if (filters.status === 'WAITING_WEEK8') {
    whereParts.push(`a1.id IS NOT NULL AND a8.id IS NULL AND DATE_ADD(a1.assessment_date, INTERVAL ${ROUND2_WAIT_DAYS} DAY) <= CURDATE()`);
  }

  if (filters.status === 'COMPLETED') {
    whereParts.push('a8.id IS NOT NULL');
  }

  if (filters.level === 'GOOD') {
    whereParts.push(`(CASE WHEN a8.total_score IS NOT NULL THEN a8.total_score WHEN a1.total_score IS NOT NULL THEN a1.total_score ELSE NULL END) <= 5`);
  }

  if (filters.level === 'PROBLEM') {
    whereParts.push(`(CASE WHEN a8.total_score IS NOT NULL THEN a8.total_score WHEN a1.total_score IS NOT NULL THEN a1.total_score ELSE NULL END) BETWEEN 6 AND 10`);
  }

  if (filters.level === 'SEVERE') {
    whereParts.push(`(CASE WHEN a8.total_score IS NOT NULL THEN a8.total_score WHEN a1.total_score IS NOT NULL THEN a1.total_score ELSE NULL END) > 10`);
  }

  if (filters.dateFrom) {
    whereParts.push(`DATE(COALESCE(a8.assessment_date, a1.assessment_date)) >= DATE(?)`);
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    whereParts.push(`DATE(COALESCE(a8.assessment_date, a1.assessment_date)) <= DATE(?)`);
    params.push(filters.dateTo);
  }
}

function transformPsqiRow(row) {
  const week1Score = toNumberOrNull(row.week1_score);
  const week8Score = toNumberOrNull(row.week8_score);
  const latestScore = toNumberOrNull(row.latest_psqi);
  const changeScore = toNumberOrNull(row.change_score);
  const statusCode = row.status_code || 'NOT_STARTED';

  return {
    user_id: row.id,
    code_id: row.code_id,
    display_name: row.display_name,
    week1_done: week1Score != null,
    week1_score: week1Score,
    week1_date: toDateOnly(row.week1_date),
    week8_done: week8Score != null,
    week8_score: week8Score,
    week8_date: toDateOnly(row.week8_date),
    latest_psqi: latestScore,
    latest_level_code: psqiLevelCode(latestScore),
    latest_level_label: psqiLevelLabel(latestScore),
    status_code: statusCode,
    status_label: psqiStatusLabel(statusCode),
    change_score: changeScore,
    change_text: trendLabel(trendCode(week1Score, week8Score)),
    week1_components: {
      c1: toNumberOrNull(row.week1_component_1),
      c2: toNumberOrNull(row.week1_component_2),
      c3: toNumberOrNull(row.week1_component_3),
      c4: toNumberOrNull(row.week1_component_4),
      c5: toNumberOrNull(row.week1_component_5),
      c6: toNumberOrNull(row.week1_component_6),
      c7: toNumberOrNull(row.week1_component_7),
    },
    week8_components: {
      c1: toNumberOrNull(row.week8_component_1),
      c2: toNumberOrNull(row.week8_component_2),
      c3: toNumberOrNull(row.week8_component_3),
      c4: toNumberOrNull(row.week8_component_4),
      c5: toNumberOrNull(row.week8_component_5),
      c6: toNumberOrNull(row.week8_component_6),
      c7: toNumberOrNull(row.week8_component_7),
    },
  };
}

function buildPsqiSummary(rows) {
  const safe = rows.map(transformPsqiRow);
  const total = safe.length;

  const week1Done = safe.filter((item) => item.week1_done).length;
  const week8Done = safe.filter((item) => item.week8_done).length;
  const completed = safe.filter((item) => item.status_code === 'COMPLETED').length;

  const week1Scores = safe.map((item) => item.week1_score).filter((value) => value != null);
  const week8Scores = safe.map((item) => item.week8_score).filter((value) => value != null);

  const avgWeek1 = week1Scores.length
    ? Number((week1Scores.reduce((sum, value) => sum + value, 0) / week1Scores.length).toFixed(1))
    : null;

  const avgWeek8 = week8Scores.length
    ? Number((week8Scores.reduce((sum, value) => sum + value, 0) / week8Scores.length).toFixed(1))
    : null;

  return {
    participants_total: total,
    week1_done: week1Done,
    week8_done: week8Done,
    completed,
    avg_psqi_week1: avgWeek1,
    avg_psqi_week8: avgWeek8,
  };
}

export async function getMonitoringOverview() {
  const [participantsRow] = await query(
    `SELECT COUNT(*) AS total FROM users`
  );

  const [psqiRow] = await query(
    `
      SELECT COUNT(*) AS total
      FROM users u
      INNER JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
      INNER JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
    `
  );

  const [diaryCompletedRow] = await query(
    `
      SELECT COUNT(DISTINCT s.user_id) AS total
      FROM sleep_diary_sessions s
      INNER JOIN (
        SELECT session_id, COUNT(*) AS completed_days
        FROM sleep_diary_records
        GROUP BY session_id
      ) r ON r.session_id = s.id
      WHERE r.completed_days >= 14
    `
  );

  const [avgPsqiRow] = await query(
    `
      SELECT AVG(latest_score) AS avg_psqi
      FROM (
        SELECT
          u.id,
          CASE
            WHEN a8.total_score IS NOT NULL THEN a8.total_score
            WHEN a1.total_score IS NOT NULL THEN a1.total_score
            ELSE NULL
          END AS latest_score
        FROM users u
        LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
        LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
      ) x
      WHERE latest_score IS NOT NULL
    `
  );

  const [avgSeRow] = await query(
    `
      SELECT AVG(x.avg_se) AS avg_se
      FROM (
        SELECT r.user_id, AVG(r.sleep_efficiency) AS avg_se
        FROM sleep_diary_records r
        GROUP BY r.user_id
      ) x
      WHERE x.avg_se IS NOT NULL
    `
  );

  const [actionRow] = await query(
    `
      SELECT COUNT(*) AS total
      FROM (
        SELECT u.id
        FROM users u
        LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
        LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
        LEFT JOIN (
          SELECT user_id, AVG(sleep_efficiency) AS avg_se, COUNT(*) AS diary_count
          FROM sleep_diary_records
          GROUP BY user_id
        ) d ON d.user_id = u.id
        WHERE (
          (CASE WHEN a8.total_score IS NOT NULL THEN a8.total_score WHEN a1.total_score IS NOT NULL THEN a1.total_score ELSE NULL END) > ?
          OR (a1.total_score IS NOT NULL AND a8.total_score IS NOT NULL AND a8.total_score > a1.total_score)
          OR (a1.total_score IS NOT NULL AND a8.total_score IS NULL AND DATE_ADD(a1.assessment_date, INTERVAL ${ROUND2_WAIT_DAYS} DAY) <= CURDATE())
          OR (COALESCE(d.diary_count, 0) > 0 AND COALESCE(d.diary_count, 0) < 14)
          OR (COALESCE(d.avg_se, 9999) < ?)
        )
      ) z
    `,
    [FOLLOWUP_PSQI_THRESHOLD, FOLLOWUP_DIARY_SE_THRESHOLD]
  );

  return {
    kpi: {
      participants_total: Number(participantsRow?.total || 0),
      psqi_completed_2_rounds: Number(psqiRow?.total || 0),
      sleep_diary_completed_14_days: Number(diaryCompletedRow?.total || 0),
      action_required_total: Number(actionRow?.total || 0),
      avg_psqi_latest: avgPsqiRow?.avg_psqi == null ? null : Number(Number(avgPsqiRow.avg_psqi).toFixed(1)),
      avg_sleep_efficiency: avgSeRow?.avg_se == null ? null : Number(Number(avgSeRow.avg_se).toFixed(1)),
    },
    config: {
      psqi_high_threshold: FOLLOWUP_PSQI_THRESHOLD,
      diary_sleep_efficiency_threshold: FOLLOWUP_DIARY_SE_THRESHOLD,
      diary_missing_days_threshold: FOLLOWUP_DIARY_MISSING_DAYS_THRESHOLD,
      round2_wait_days: ROUND2_WAIT_DAYS,
    },
  };
}

export async function listMonitoringPsqi(filters = {}) {
  const paging = normalizePagination(filters);
  const sort = normalizeSort(filters, {
    participant_id: 'u.code_id',
    name: 'u.display_name',
    week1_score: 'a1.total_score',
    week8_score: 'a8.total_score',
    latest_psqi: 'latest_psqi',
    created_at: 'u.created_at',
  });

  const params = [];
  const whereParts = ['1=1'];
  appendPsqiFilters(whereParts, params, filters);

  const base = psqiBaseQuery();
  const whereClause = `WHERE ${whereParts.join(' AND ')}`;

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      ${base}
      ${whereClause}
    `,
    params
  );

  const rows = await query(
    `
      SELECT ${psqiSelectFields()}
      ${base}
      ${whereClause}
      ORDER BY ${sort.sortBy} ${sort.sortOrder}
      LIMIT ? OFFSET ?
    `,
    [...params, paging.limit, paging.offset]
  );

  const allRowsForSummary = await query(
    `
      SELECT ${psqiSelectFields()}
      ${base}
      ${whereClause}
    `,
    params
  );

  const total = Number(countRows[0]?.total || 0);

  return {
    items: rows.map(transformPsqiRow),
    summary: buildPsqiSummary(allRowsForSummary),
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total,
      total_pages: Math.ceil(total / paging.limit) || 1,
    },
    config: {
      psqi_high_threshold: FOLLOWUP_PSQI_THRESHOLD,
      round2_wait_days: ROUND2_WAIT_DAYS,
    },
  };
}

export async function getMonitoringPsqiDetail(userIdInput) {
  const userId = parseUserId(userIdInput);

  const userRows = await query(
    `
      SELECT id, code_id, display_name
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  );

  if (!userRows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const rounds = await query(
    `
      SELECT
        id,
        assessment_round,
        assessment_date,
        total_score,
        interpretation,
        component_1,
        component_2,
        component_3,
        component_4,
        component_5,
        component_6,
        component_7
      FROM user_assessments
      WHERE user_id = ?
      ORDER BY assessment_round ASC
    `,
    [userId]
  );

  const week1 = rounds.find((item) => Number(item.assessment_round) === 1) || null;
  const week8 = rounds.find((item) => Number(item.assessment_round) === 2) || null;

  const week1Score = toNumberOrNull(week1?.total_score);
  const week8Score = toNumberOrNull(week8?.total_score);
  const latestScore = week8Score ?? week1Score;
  const changeScore = week1Score != null && week8Score != null ? week8Score - week1Score : null;

  return {
    participant: userRows[0],
    week1: week1
      ? {
          assessment_date: toDateOnly(week1.assessment_date),
          total_score: week1Score,
          interpretation: week1.interpretation,
          components: {
            c1: toNumberOrNull(week1.component_1),
            c2: toNumberOrNull(week1.component_2),
            c3: toNumberOrNull(week1.component_3),
            c4: toNumberOrNull(week1.component_4),
            c5: toNumberOrNull(week1.component_5),
            c6: toNumberOrNull(week1.component_6),
            c7: toNumberOrNull(week1.component_7),
          },
        }
      : null,
    week8: week8
      ? {
          assessment_date: toDateOnly(week8.assessment_date),
          total_score: week8Score,
          interpretation: week8.interpretation,
          components: {
            c1: toNumberOrNull(week8.component_1),
            c2: toNumberOrNull(week8.component_2),
            c3: toNumberOrNull(week8.component_3),
            c4: toNumberOrNull(week8.component_4),
            c5: toNumberOrNull(week8.component_5),
            c6: toNumberOrNull(week8.component_6),
            c7: toNumberOrNull(week8.component_7),
          },
        }
      : null,
    latest_level_code: psqiLevelCode(latestScore),
    latest_level_label: psqiLevelLabel(latestScore),
    change_score: changeScore,
    change_text: trendLabel(trendCode(week1Score, week8Score)),
    chart: {
      categories: ['Week 1', 'Week 8'],
      series: [week1Score, week8Score],
    },
  };
}

function sleepDiaryBaseQuery() {
  return `
    FROM users u
    LEFT JOIN (
      SELECT s.user_id, s.id AS session_id, s.start_date, s.end_date, s.total_days
      FROM sleep_diary_sessions s
      INNER JOIN (
        SELECT user_id, MAX(id) AS max_id
        FROM sleep_diary_sessions
        GROUP BY user_id
      ) x ON x.max_id = s.id
    ) ss ON ss.user_id = u.id
    LEFT JOIN (
      SELECT
        r.session_id,
        COUNT(*) AS completed_days,
        SUM(CASE WHEN r.week_number = 1 THEN 1 ELSE 0 END) AS week1_completed,
        SUM(CASE WHEN r.week_number = 2 THEN 1 ELSE 0 END) AS week2_completed,
        AVG(r.sleep_efficiency) AS avg_se,
        AVG(r.tst_minutes) AS avg_tst_minutes,
        AVG(r.sol_minutes) AS avg_sol_minutes,
        AVG(r.waso_minutes) AS avg_waso_minutes,
        MAX(r.updated_at) AS last_record_at
      FROM sleep_diary_records r
      GROUP BY r.session_id
    ) d ON d.session_id = ss.session_id
  `;
}

function sleepDiarySelectFields() {
  return `
    u.id,
    u.code_id,
    u.display_name,
    ss.session_id,
    ss.start_date,
    ss.end_date,
    COALESCE(ss.total_days, 14) AS total_days,
    COALESCE(d.week1_completed, 0) AS week1_completed,
    COALESCE(d.week2_completed, 0) AS week2_completed,
    COALESCE(d.completed_days, 0) AS completed_days,
    d.avg_se,
    d.avg_tst_minutes,
    d.avg_sol_minutes,
    d.avg_waso_minutes,
    d.last_record_at,
    LEAST(COALESCE(ss.total_days, 14), GREATEST(0, DATEDIFF(CURDATE(), ss.start_date) + 1)) AS available_days,
    GREATEST(0, LEAST(COALESCE(ss.total_days, 14), GREATEST(0, DATEDIFF(CURDATE(), ss.start_date) + 1)) - COALESCE(d.completed_days, 0)) AS missing_days,
    CASE
      WHEN ss.session_id IS NULL OR COALESCE(d.completed_days, 0) = 0 THEN 'NOT_STARTED'
      WHEN COALESCE(d.completed_days, 0) >= COALESCE(ss.total_days, 14) THEN 'COMPLETED'
      WHEN GREATEST(0, LEAST(COALESCE(ss.total_days, 14), GREATEST(0, DATEDIFF(CURDATE(), ss.start_date) + 1)) - COALESCE(d.completed_days, 0)) >= ${FOLLOWUP_DIARY_MISSING_DAYS_THRESHOLD} THEN 'ACTION_REQUIRED'
      ELSE 'IN_PROGRESS'
    END AS status_code
  `;
}

function appendSleepDiaryFilters(whereParts, params, filters = {}) {
  const search = String(filters.search || '').trim();
  if (search) {
    whereParts.push('(u.code_id LIKE ? OR u.display_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.status === 'NOT_STARTED') {
    whereParts.push('(ss.session_id IS NULL OR COALESCE(d.completed_days, 0) = 0)');
  }

  if (filters.status === 'IN_PROGRESS') {
    whereParts.push(`(
      ss.session_id IS NOT NULL
      AND COALESCE(d.completed_days, 0) BETWEEN 1 AND (COALESCE(ss.total_days, 14) - 1)
      AND GREATEST(0, LEAST(COALESCE(ss.total_days, 14), GREATEST(0, DATEDIFF(CURDATE(), ss.start_date) + 1)) - COALESCE(d.completed_days, 0)) < ${FOLLOWUP_DIARY_MISSING_DAYS_THRESHOLD}
    )`);
  }

  if (filters.status === 'ACTION_REQUIRED') {
    whereParts.push(`(
      ss.session_id IS NOT NULL
      AND COALESCE(d.completed_days, 0) < COALESCE(ss.total_days, 14)
      AND GREATEST(0, LEAST(COALESCE(ss.total_days, 14), GREATEST(0, DATEDIFF(CURDATE(), ss.start_date) + 1)) - COALESCE(d.completed_days, 0)) >= ${FOLLOWUP_DIARY_MISSING_DAYS_THRESHOLD}
    )`);
  }

  if (filters.status === 'COMPLETED') {
    whereParts.push('COALESCE(d.completed_days, 0) >= COALESCE(ss.total_days, 14)');
  }

  if (filters.completion === 'WEEK1_DONE') {
    whereParts.push('COALESCE(d.week1_completed, 0) >= 7');
  }

  if (filters.completion === 'WEEK2_DONE') {
    whereParts.push('COALESCE(d.week2_completed, 0) >= 7');
  }

  if (filters.completion === 'COMPLETE_14') {
    whereParts.push('COALESCE(d.completed_days, 0) >= COALESCE(ss.total_days, 14)');
  }

  if (filters.shiftType && ['MORNING', 'AFTERNOON', 'NIGHT', 'OFF'].includes(filters.shiftType)) {
    whereParts.push('EXISTS (SELECT 1 FROM sleep_diary_records r WHERE r.session_id = ss.session_id AND r.shift_type = ?)');
    params.push(filters.shiftType);
  }

  if (filters.dateFrom) {
    whereParts.push('DATE(ss.start_date) >= DATE(?)');
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    whereParts.push('DATE(ss.start_date) <= DATE(?)');
    params.push(filters.dateTo);
  }
}

function transformSleepDiaryRow(row) {
  const totalDays = Number(row.total_days || 14);
  const completedDays = Number(row.completed_days || 0);
  const week1Completed = Number(row.week1_completed || 0);
  const week2Completed = Number(row.week2_completed || 0);
  const progressPct = totalDays > 0 ? Number(((completedDays / totalDays) * 100).toFixed(0)) : 0;
  const avgSe = row.avg_se == null ? null : Number(Number(row.avg_se).toFixed(1));

  return {
    user_id: row.id,
    code_id: row.code_id,
    display_name: row.display_name,
    week1: `${Math.min(7, week1Completed)} / 7`,
    week2: `${Math.min(7, week2Completed)} / 7`,
    completed_days: completedDays,
    total_days: totalDays,
    progress_percent: progressPct,
    avg_se: avgSe,
    avg_tst_hours: row.avg_tst_minutes == null ? null : Number((Number(row.avg_tst_minutes) / 60).toFixed(1)),
    avg_sol_minutes: row.avg_sol_minutes == null ? null : Number(Number(row.avg_sol_minutes).toFixed(1)),
    avg_waso_minutes: row.avg_waso_minutes == null ? null : Number(Number(row.avg_waso_minutes).toFixed(1)),
    status_code: row.status_code,
    status_label: diaryStatusLabel(row.status_code),
    missing_days: Number(row.missing_days || 0),
    available_days: Number(row.available_days || 0),
    last_record_at: row.last_record_at || null,
  };
}

function buildSleepDiarySummary(rows) {
  const safe = rows.map(transformSleepDiaryRow);
  const total = safe.length;

  const inProgress = safe.filter((item) => item.status_code === 'IN_PROGRESS').length;
  const week1Done = safe.filter((item) => item.completed_days >= 7).length;
  const done14 = safe.filter((item) => item.completed_days >= 14).length;

  const seValues = safe.map((item) => item.avg_se).filter((value) => value != null);
  const tstValues = safe.map((item) => item.avg_tst_hours).filter((value) => value != null);
  const solValues = safe.map((item) => item.avg_sol_minutes).filter((value) => value != null);
  const wasoValues = safe.map((item) => item.avg_waso_minutes).filter((value) => value != null);

  const avg = (values, digits = 1) =>
    values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits)) : null;

  return {
    participants_total: total,
    in_progress: inProgress,
    completed_7_days: week1Done,
    completed_14_days: done14,
    avg_se: avg(seValues, 1),
    avg_tst_hours: avg(tstValues, 1),
    avg_sol_minutes: avg(solValues, 1),
    avg_waso_minutes: avg(wasoValues, 1),
  };
}

export async function listMonitoringSleepDiary(filters = {}) {
  const paging = normalizePagination(filters);
  const sort = normalizeSort(filters, {
    participant_id: 'u.code_id',
    name: 'u.display_name',
    progress: 'completed_days',
    avg_se: 'd.avg_se',
    avg_tst: 'd.avg_tst_minutes',
    created_at: 'u.created_at',
  });

  const params = [];
  const whereParts = ['1=1'];
  appendSleepDiaryFilters(whereParts, params, filters);

  const base = sleepDiaryBaseQuery();
  const whereClause = `WHERE ${whereParts.join(' AND ')}`;

  const countRows = await query(
    `
      SELECT COUNT(*) AS total
      ${base}
      ${whereClause}
    `,
    params
  );

  const rows = await query(
    `
      SELECT ${sleepDiarySelectFields()}
      ${base}
      ${whereClause}
      ORDER BY ${sort.sortBy} ${sort.sortOrder}
      LIMIT ? OFFSET ?
    `,
    [...params, paging.limit, paging.offset]
  );

  const allRowsForSummary = await query(
    `
      SELECT ${sleepDiarySelectFields()}
      ${base}
      ${whereClause}
    `,
    params
  );

  const total = Number(countRows[0]?.total || 0);

  return {
    items: rows.map(transformSleepDiaryRow),
    summary: buildSleepDiarySummary(allRowsForSummary),
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total,
      total_pages: Math.ceil(total / paging.limit) || 1,
    },
    config: {
      diary_sleep_efficiency_threshold: FOLLOWUP_DIARY_SE_THRESHOLD,
      diary_missing_days_threshold: FOLLOWUP_DIARY_MISSING_DAYS_THRESHOLD,
    },
  };
}

export async function getMonitoringSleepDiaryDetail(userIdInput) {
  const userId = parseUserId(userIdInput);

  const userRows = await query(
    `SELECT id, code_id, display_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );

  if (!userRows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const sessionRows = await query(
    `
      SELECT s.*
      FROM sleep_diary_sessions s
      WHERE s.user_id = ?
      ORDER BY s.id DESC
      LIMIT 1
    `,
    [userId]
  );

  const session = sessionRows[0] || null;
  if (!session) {
    return {
      participant: userRows[0],
      session: null,
      days: [],
      weekly_summary: null,
      charts: null,
    };
  }

  const records = await query(
    `
      SELECT *
      FROM sleep_diary_records
      WHERE session_id = ?
      ORDER BY day_number ASC
    `,
    [session.id]
  );

  const goalRows = await query(
    `
      SELECT *
      FROM sleep_diary_smart_goals
      WHERE session_id = ? AND user_id = ?
      LIMIT 1
    `,
    [session.id, userId]
  );

  const smartGoal = normalizeSmartGoal(goalRows[0] || null);

  const byDay = new Map(records.map((item) => [Number(item.day_number), item]));
  const totalDays = Number(session.total_days || 14);

  const days = Array.from({ length: totalDays }).map((_, idx) => {
    const dayNumber = idx + 1;
    const record = byDay.get(dayNumber) || null;

    return {
      day_number: dayNumber,
      week_number: dayNumber <= 7 ? 1 : 2,
      status: record ? 'COMPLETED' : 'PENDING',
      sleep_efficiency: record?.sleep_efficiency == null ? null : Number(record.sleep_efficiency),
      record: record
        ? {
            wake_date: toDateOnly(record.wake_date),
            shift_type: record.shift_type,
            bedtime: record.bedtime,
            attempt_sleep_time: record.attempt_sleep_time,
            sol_minutes: Number(record.sol_minutes),
            number_of_awakenings: Number(record.number_of_awakenings),
            waso_minutes: Number(record.waso_minutes),
            final_wake_time: record.final_wake_time,
            get_up_time: record.get_up_time,
            sleep_after_final_wake_minutes: Number(record.sleep_after_final_wake_minutes),
            early_wake: Number(record.early_wake),
            tib_minutes: Number(record.tib_minutes),
            tst_minutes: Number(record.tst_minutes),
            sleep_efficiency: record.sleep_efficiency == null ? null : Number(record.sleep_efficiency),
            sleep_quality: Number(record.sleep_quality),
            morning_refreshment: Number(record.morning_refreshment),
            shift_sleepiness: Number(record.shift_sleepiness),
            work_stress: Number(record.work_stress),
            ot_done: Number(record.ot_done || 0),
            sleep_medication: Number(record.sleep_medication || 0),
            nap_count: Number(record.nap_count || 0),
            nap: Number(record.nap),
            nap_minutes: Number(record.nap_minutes),
            caffeine_cups: Number(record.caffeine_cups),
            phone_before_bed_minutes: Number(record.phone_before_bed_minutes),
            breathing_478: Number(record.breathing_478),
            breathing_478_time: record.breathing_478_time ? String(record.breathing_478_time).slice(0, 5) : null,
            last_caffeine_time: record.last_caffeine_time ? String(record.last_caffeine_time).slice(0, 5) : null,
            bedroom_adjustment_done: Number(record.bedroom_adjustment_done || 0),
          }
        : null,
      smart_goal_daily: record ? evaluateSmartGoalForRecord(smartGoal, record) : null,
    };
  });

  const weekly = {
    week_1: records.filter((r) => Number(r.week_number) === 1),
    week_2: records.filter((r) => Number(r.week_number) === 2),
  };

  const avg = (items, key) => {
    if (!items.length) return null;
    const sum = items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
    return Number((sum / items.length).toFixed(1));
  };

  const weekly_summary = {
    week_1: {
      completed_days: weekly.week_1.length,
      total_days: 7,
      avg_se: avg(weekly.week_1.filter((item) => item.sleep_efficiency != null), 'sleep_efficiency'),
      avg_tst_hours: avg(weekly.week_1, 'tst_minutes') == null ? null : Number((avg(weekly.week_1, 'tst_minutes') / 60).toFixed(1)),
      avg_sol_minutes: avg(weekly.week_1, 'sol_minutes'),
      avg_waso_minutes: avg(weekly.week_1, 'waso_minutes'),
    },
    week_2: {
      completed_days: weekly.week_2.length,
      total_days: 7,
      avg_se: avg(weekly.week_2.filter((item) => item.sleep_efficiency != null), 'sleep_efficiency'),
      avg_tst_hours: avg(weekly.week_2, 'tst_minutes') == null ? null : Number((avg(weekly.week_2, 'tst_minutes') / 60).toFixed(1)),
      avg_sol_minutes: avg(weekly.week_2, 'sol_minutes'),
      avg_waso_minutes: avg(weekly.week_2, 'waso_minutes'),
    },
  };

  const categories = days.map((item) => `Day ${item.day_number}`);

  return {
    participant: userRows[0],
    session: {
      id: session.id,
      start_date: toDateOnly(session.start_date),
      end_date: toDateOnly(session.end_date),
      total_days: totalDays,
      status: session.status,
    },
    progress: {
      completed_days: records.length,
      total_days: totalDays,
      percent: totalDays > 0 ? Number(((records.length / totalDays) * 100).toFixed(0)) : 0,
    },
    days,
    weekly_summary,
    charts: {
      categories,
      se: days.map((item) => item.record?.sleep_efficiency ?? null),
      tst_hours: days.map((item) =>
        item.record?.tst_minutes == null ? null : Number((Number(item.record.tst_minutes) / 60).toFixed(2))
      ),
      sol: days.map((item) => item.record?.sol_minutes ?? null),
      waso: days.map((item) => item.record?.waso_minutes ?? null),
      subjective: {
        sleep_quality: days.map((item) => item.record?.sleep_quality ?? null),
        morning_refreshment: days.map((item) => item.record?.morning_refreshment ?? null),
        shift_sleepiness: days.map((item) => item.record?.shift_sleepiness ?? null),
        work_stress: days.map((item) => item.record?.work_stress ?? null),
      },
    },
    smart_goal: summarizeSmartGoal(records, smartGoal),
  };
}

export async function getMonitoringParticipantOverview(userIdInput) {
  const userId = parseUserId(userIdInput);
  const psqi = await getMonitoringPsqiDetail(userId);
  const diary = await getMonitoringSleepDiaryDetail(userId);

  const timeline = [];

  if (psqi.week1) {
    timeline.push({ key: 'psqi_w1', label: 'Thai-PSQI Week 1', done: true, date: psqi.week1.assessment_date });
  } else {
    timeline.push({ key: 'psqi_w1', label: 'Thai-PSQI Week 1', done: false, date: null });
  }

  const firstDiaryDay = diary.days.find((item) => item.record);
  timeline.push({
    key: 'diary_day_1',
    label: 'Sleep Diary Day 1',
    done: Boolean(firstDiaryDay),
    date: firstDiaryDay?.record?.wake_date || null,
  });

  if (psqi.week8) {
    timeline.push({ key: 'psqi_w8', label: 'Thai-PSQI Week 8', done: true, date: psqi.week8.assessment_date });
  } else {
    timeline.push({ key: 'psqi_w8', label: 'Thai-PSQI Week 8', done: false, date: null });
  }

  const day14 = diary.days.find((item) => item.day_number === 14);
  timeline.push({
    key: 'diary_day_14',
    label: 'Sleep Diary Day 14',
    done: Boolean(day14?.record),
    date: day14?.record?.wake_date || null,
  });

  return {
    participant: psqi.participant,
    project_status: diary.progress?.completed_days > 0 || psqi.week1 ? 'IN_PROGRESS' : 'NOT_STARTED',
    psqi: {
      week1: psqi.week1?.total_score ?? null,
      week8: psqi.week8?.total_score ?? null,
      change: psqi.change_score,
      change_text: psqi.change_text,
      latest_level_label: psqi.latest_level_label,
    },
    diary: {
      progress_days: `${diary.progress?.completed_days || 0} / ${diary.progress?.total_days || 14}`,
      avg_se: diary.charts?.se?.filter((value) => value != null).length
        ? Number(
            (
              diary.charts.se
                .filter((value) => value != null)
                .reduce((sum, value) => sum + Number(value), 0) /
              diary.charts.se.filter((value) => value != null).length
            ).toFixed(1)
          )
        : null,
      avg_tst_hours: diary.charts?.tst_hours?.filter((value) => value != null).length
        ? Number(
            (
              diary.charts.tst_hours
                .filter((value) => value != null)
                .reduce((sum, value) => sum + Number(value), 0) /
              diary.charts.tst_hours.filter((value) => value != null).length
            ).toFixed(1)
          )
        : null,
    },
    timeline,
  };
}

export async function listMonitoringActionRequired(filters = {}) {
  const paging = normalizePagination(filters);
  const search = String(filters.search || '').trim();
  const searchWhere = search ? 'WHERE (u.code_id LIKE ? OR u.display_name LIKE ?)' : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  const rows = await query(
    `
      SELECT *
      FROM (
        SELECT
          u.id AS user_id,
          u.code_id,
          u.display_name,
          'PSQI' AS type,
          'คะแนน > ${FOLLOWUP_PSQI_THRESHOLD}' AS detail,
          CASE
            WHEN a8.assessment_date IS NOT NULL THEN a8.assessment_date
            ELSE a1.assessment_date
          END AS event_date,
          'HIGH' AS level_code
        FROM users u
        LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
        LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
        WHERE (CASE WHEN a8.total_score IS NOT NULL THEN a8.total_score WHEN a1.total_score IS NOT NULL THEN a1.total_score ELSE NULL END) > ${FOLLOWUP_PSQI_THRESHOLD}

        UNION ALL

        SELECT
          u.id AS user_id,
          u.code_id,
          u.display_name,
          'PSQI' AS type,
          'Week 8 แย่ลง' AS detail,
          a8.assessment_date AS event_date,
          'HIGH' AS level_code
        FROM users u
        INNER JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
        INNER JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
        WHERE a8.total_score > a1.total_score

        UNION ALL

        SELECT
          u.id AS user_id,
          u.code_id,
          u.display_name,
          'PSQI' AS type,
          'รอการประเมิน Week 8' AS detail,
          DATE_ADD(a1.assessment_date, INTERVAL ${ROUND2_WAIT_DAYS} DAY) AS event_date,
          'MEDIUM' AS level_code
        FROM users u
        INNER JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
        LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
        WHERE a8.id IS NULL AND DATE_ADD(a1.assessment_date, INTERVAL ${ROUND2_WAIT_DAYS} DAY) <= CURDATE()

        UNION ALL

        SELECT
          u.id AS user_id,
          u.code_id,
          u.display_name,
          'Sleep Diary' AS type,
          CONCAT('บันทึกเพียง ', COALESCE(d.completed_days, 0), ' / 14 วัน') AS detail,
          d.last_record_at AS event_date,
          'MEDIUM' AS level_code
        FROM users u
        LEFT JOIN (
          SELECT
            r.user_id,
            COUNT(*) AS completed_days,
            AVG(r.sleep_efficiency) AS avg_se,
            MAX(r.updated_at) AS last_record_at
          FROM sleep_diary_records r
          GROUP BY r.user_id
        ) d ON d.user_id = u.id
        WHERE COALESCE(d.completed_days, 0) BETWEEN 1 AND 13

        UNION ALL

        SELECT
          u.id AS user_id,
          u.code_id,
          u.display_name,
          'Sleep Diary' AS type,
          CONCAT('Sleep Efficiency ต่ำกว่า ', ${FOLLOWUP_DIARY_SE_THRESHOLD}, '%') AS detail,
          d.last_record_at AS event_date,
          'MEDIUM' AS level_code
        FROM users u
        LEFT JOIN (
          SELECT
            r.user_id,
            AVG(r.sleep_efficiency) AS avg_se,
            MAX(r.updated_at) AS last_record_at
          FROM sleep_diary_records r
          GROUP BY r.user_id
        ) d ON d.user_id = u.id
        WHERE d.avg_se IS NOT NULL AND d.avg_se < ${FOLLOWUP_DIARY_SE_THRESHOLD}
      ) x
      ${searchWhere.replace(/u\./g, 'x.')}
      ORDER BY event_date DESC, user_id DESC
    `,
    searchParams
  );

  const total = rows.length;
  const sliced = rows.slice(paging.offset, paging.offset + paging.limit).map((row) => ({
    user_id: row.user_id,
    code_id: row.code_id,
    display_name: row.display_name,
    type: row.type,
    detail: row.detail,
    event_date: toDateOnly(row.event_date),
    level_code: row.level_code,
  }));

  return {
    items: sliced,
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total,
      total_pages: Math.ceil(total / paging.limit) || 1,
    },
  };
}

export async function listMonitoringLearning(filters = {}) {
  const paging = normalizePagination(filters);
  const search = String(filters.search || '').trim();
  const searchWhere = search ? 'WHERE (u.code_id LIKE ? OR u.display_name LIKE ?)' : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  const users = await query(
    `
      SELECT u.id AS user_id, u.code_id, u.display_name
      FROM users u
      ${searchWhere}
      ORDER BY u.id DESC
    `,
    searchParams
  );

  const progressMap = await getUsersLearningProgressMap(users.map((item) => item.user_id));

  const transformed = users.map((user) => {
    const progress = progressMap.get(Number(user.user_id)) || {
      intro_percent: 0,
      intro_unlocked: false,
      completed_lessons: 0,
      total_lessons: LESSON_TOTAL,
      lesson_completion_percent: 0,
      last_activity_at: null,
    };
    const statusCode = learningStatusCode(progress);

    return {
      user_id: user.user_id,
      code_id: user.code_id,
      display_name: user.display_name,
      intro_percent: progress.intro_percent,
      intro_unlocked: progress.intro_unlocked,
      completed_lessons: progress.completed_lessons,
      total_lessons: progress.total_lessons,
      lesson_completion_percent: progress.lesson_completion_percent,
      last_activity_at: progress.last_activity_at,
      status_code: statusCode,
      status_label: learningStatusLabel(statusCode),
      pretest_score: progress.quiz?.pretest?.score ?? null,
      pretest_percent: progress.quiz?.pretest?.percent ?? null,
      pretest_submitted_at: progress.quiz?.pretest?.submitted_at ?? null,
      posttest_score: progress.quiz?.posttest?.score ?? null,
      posttest_percent: progress.quiz?.posttest?.percent ?? null,
      posttest_submitted_at: progress.quiz?.posttest?.submitted_at ?? null,
      gain_score:
        progress.quiz?.pretest && progress.quiz?.posttest
          ? Number(progress.quiz.posttest.score || 0) - Number(progress.quiz.pretest.score || 0)
          : null,
    };
  });

  let filtered = transformed;
  if (filters.status === 'INTRO_PENDING') {
    filtered = filtered.filter((item) => item.status_code === 'INTRO_PENDING');
  }
  if (filters.status === 'NOT_STARTED') {
    filtered = filtered.filter((item) => item.status_code === 'NOT_STARTED');
  }
  if (filters.status === 'IN_PROGRESS') {
    filtered = filtered.filter((item) => item.status_code === 'IN_PROGRESS');
  }
  if (filters.status === 'COMPLETED') {
    filtered = filtered.filter((item) => item.status_code === 'COMPLETED');
  }

  const total = filtered.length;
  const items = filtered.slice(paging.offset, paging.offset + paging.limit);

  const introUnlocked = transformed.filter((item) => item.intro_unlocked).length;
  const completedLearners = transformed.filter((item) => item.status_code === 'COMPLETED').length;
  const inProgress = transformed.filter((item) => item.status_code === 'IN_PROGRESS').length;
  const completionValues = transformed.map((item) => item.lesson_completion_percent);
  const pretestValues = transformed.map((item) => item.pretest_percent).filter((value) => value != null);
  const posttestValues = transformed.map((item) => item.posttest_percent).filter((value) => value != null);

  return {
    items,
    summary: {
      participants_total: transformed.length,
      intro_unlocked,
      intro_pending: transformed.length - introUnlocked,
      in_progress: inProgress,
      completed: completedLearners,
      avg_lesson_completion_percent: completionValues.length
        ? Number((completionValues.reduce((sum, value) => sum + Number(value || 0), 0) / completionValues.length).toFixed(1))
        : 0,
      avg_pretest_percent: pretestValues.length
        ? Number((pretestValues.reduce((sum, value) => sum + Number(value), 0) / pretestValues.length).toFixed(1))
        : null,
      avg_posttest_percent: posttestValues.length
        ? Number((posttestValues.reduce((sum, value) => sum + Number(value), 0) / posttestValues.length).toFixed(1))
        : null,
    },
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total,
      total_pages: Math.ceil(total / paging.limit) || 1,
    },
    config: {
      intro_unlock_percent: INTRO_UNLOCK_PERCENT,
      total_lessons: LESSON_TOTAL,
    },
  };
}

export async function getMonitoringLearningDetail(userIdInput) {
  const userId = parseUserId(userIdInput);

  const userRows = await query(
    `SELECT id, code_id, display_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );

  if (!userRows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const progressMap = await getUsersLearningProgressMap([userId]);
  const progress = progressMap.get(userId) || {
    intro_percent: 0,
    intro_unlocked: false,
    intro_completed_at: null,
    completed_lessons: 0,
    total_lessons: LESSON_TOTAL,
    lesson_completion_percent: 0,
    last_activity_at: null,
    lessons: [],
  };

  const lessonMap = new Map((progress.lessons || []).map((item) => [String(item.lesson_key), item]));
  const lessons = ['lesson1', 'lesson2', 'lesson3', 'lesson4'].map((key, index) => {
    const row = lessonMap.get(key);
    return {
      lesson_key: key,
      lesson_no: index + 1,
      video_watched_percent: row ? Number((Number(row.video_watched_percent || 0)).toFixed(1)) : 0,
      video_completed: row ? Boolean(row.video_completed) : false,
      pdf_opened: row ? Boolean(row.pdf_opened) : false,
      is_completed: row ? Boolean(row.is_completed) : false,
      updated_at: row?.updated_at || null,
    };
  });

  const statusCode = learningStatusCode(progress);

  return {
    participant: userRows[0],
    intro: {
      watched_percent: progress.intro_percent,
      threshold_percent: INTRO_UNLOCK_PERCENT,
      unlocked: progress.intro_unlocked,
      completed_at: progress.intro_completed_at,
    },
    summary: {
      completed_lessons: progress.completed_lessons,
      total_lessons: progress.total_lessons,
      lesson_completion_percent: progress.lesson_completion_percent,
      status_code: statusCode,
      status_label: learningStatusLabel(statusCode),
      last_activity_at: progress.last_activity_at,
    },
    quiz: {
      pretest: progress.quiz?.pretest || null,
      posttest: progress.quiz?.posttest || null,
      gain_score:
        progress.quiz?.pretest && progress.quiz?.posttest
          ? Number(progress.quiz.posttest.score || 0) - Number(progress.quiz.pretest.score || 0)
          : null,
    },
    lessons,
  };
}

export async function listMonitoringSmartGoal(filters = {}) {
  const paging = normalizePagination(filters);
  const search = String(filters.search || '').trim();
  const searchWhere = search ? 'WHERE (u.code_id LIKE ? OR u.display_name LIKE ?)' : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  const rows = await query(
    `
      SELECT
        u.id AS user_id,
        u.code_id,
        u.display_name,
        s.id AS session_id,
        COALESCE(s.total_days, 14) AS total_days,
        g.id AS smart_goal_id,
        g.sleep_hours_target,
        g.night_shift_nap_minutes_target,
        g.breathing_frequency_days,
        g.breathing_time,
        g.caffeine_cutoff_hours,
        g.bedroom_adjustment_plan,
        COALESCE(d.completed_days, 0) AS completed_days
      FROM users u
      LEFT JOIN (
        SELECT s1.*
        FROM sleep_diary_sessions s1
        INNER JOIN (
          SELECT user_id, MAX(id) AS max_id
          FROM sleep_diary_sessions
          GROUP BY user_id
        ) sx ON sx.max_id = s1.id
      ) s ON s.user_id = u.id
      LEFT JOIN sleep_diary_smart_goals g ON g.session_id = s.id AND g.user_id = u.id
      LEFT JOIN (
        SELECT session_id, COUNT(*) AS completed_days
        FROM sleep_diary_records
        GROUP BY session_id
      ) d ON d.session_id = s.id
      ${searchWhere}
      ORDER BY u.id DESC
    `,
    searchParams
  );

  const sessionIds = [...new Set(rows.map((row) => Number(row.session_id)).filter((id) => Number.isInteger(id) && id > 0))];
  const recordsBySession = new Map();

  if (sessionIds.length) {
    const placeholders = sessionIds.map(() => '?').join(', ');
    const records = await query(
      `
        SELECT *
        FROM sleep_diary_records
        WHERE session_id IN (${placeholders})
        ORDER BY day_number ASC
      `,
      sessionIds
    );

    for (const record of records) {
      const key = Number(record.session_id);
      if (!recordsBySession.has(key)) recordsBySession.set(key, []);
      recordsBySession.get(key).push(record);
    }
  }

  const transformed = rows.map((row) => {
    const sessionId = Number(row.session_id || 0);
    const records = recordsBySession.get(sessionId) || [];
    const goal = row.smart_goal_id
      ? normalizeSmartGoal({
          id: row.smart_goal_id,
          session_id: row.session_id,
          user_id: row.user_id,
          sleep_hours_target: row.sleep_hours_target,
          night_shift_nap_minutes_target: row.night_shift_nap_minutes_target,
          breathing_frequency_days: row.breathing_frequency_days,
          breathing_time: row.breathing_time,
          caffeine_cutoff_hours: row.caffeine_cutoff_hours,
          bedroom_adjustment_plan: row.bedroom_adjustment_plan,
        })
      : null;

    const summary = summarizeSmartGoal(records, goal);

    return {
      user_id: row.user_id,
      code_id: row.code_id,
      display_name: row.display_name,
      smart_goal_configured: summary.configured,
      completed_days: Number(row.completed_days || 0),
      total_days: Number(row.total_days || 14),
      achieved_any_goal_days: summary.achieved_any_goal_days,
      achieved_all_goal_days: summary.achieved_all_applicable_goal_days,
      overall_adherence_percent: summary.overall_adherence_percent,
      status_label: summary.configured ? 'ตั้งเป้าหมายแล้ว' : 'ยังไม่ตั้งเป้าหมาย',
    };
  });

  let filtered = transformed;
  if (filters.status === 'CONFIGURED') {
    filtered = filtered.filter((item) => item.smart_goal_configured);
  }
  if (filters.status === 'NOT_CONFIGURED') {
    filtered = filtered.filter((item) => !item.smart_goal_configured);
  }

  const total = filtered.length;
  const items = filtered.slice(paging.offset, paging.offset + paging.limit);

  const configuredCount = transformed.filter((item) => item.smart_goal_configured).length;
  const adherenceValues = transformed
    .map((item) => item.overall_adherence_percent)
    .filter((value) => value != null);

  return {
    items,
    summary: {
      participants_total: transformed.length,
      configured_participants: configuredCount,
      not_configured_participants: transformed.length - configuredCount,
      avg_adherence_percent: adherenceValues.length
        ? Number((adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length).toFixed(1))
        : null,
    },
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total,
      total_pages: Math.ceil(total / paging.limit) || 1,
    },
  };
}

export async function getMonitoringSmartGoalDetail(userIdInput) {
  const diaryDetail = await getMonitoringSleepDiaryDetail(userIdInput);

  const days = (diaryDetail.days || []).map((day) => ({
    day_number: day.day_number,
    status: day.status,
    smart_goal_daily: day.smart_goal_daily,
  }));

  return {
    participant: diaryDetail.participant,
    session: diaryDetail.session,
    progress: diaryDetail.progress,
    smart_goal: diaryDetail.smart_goal,
    days,
  };
}
