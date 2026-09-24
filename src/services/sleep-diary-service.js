import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

const SESSION_TOTAL_DAYS = 14;

let schemaReadyPromise;

function toDateOnly(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utcDate.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const base = new Date(`${dateString}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function dateDiffInDays(startDateString, endDateString) {
  const start = new Date(`${startDateString}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDateString}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / (24 * 60 * 60 * 1000));
}

function parseTimeToMinutes(value) {
  const [hourRaw, minuteRaw] = String(value).split(':');
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

function minutesDiffCrossMidnight(start, end) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  return endMinutes >= startMinutes
    ? endMinutes - startMinutes
    : 24 * 60 - startMinutes + endMinutes;
}

function calculateSleepMetrics(input) {
  const tibMinutes = minutesDiffCrossMidnight(input.bedtime, input.get_up_time);
  const tstRaw = tibMinutes - input.sol_minutes - input.waso_minutes;
  const tstMinutes = Math.max(0, tstRaw);
  const sleepEfficiency = tibMinutes > 0 ? Number(((tstMinutes / tibMinutes) * 100).toFixed(2)) : null;

  return {
    tib_minutes: tibMinutes,
    tst_minutes: tstMinutes,
    sleep_efficiency: sleepEfficiency,
  };
}

async function ensureSleepDiarySchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(
      `
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('sleep_diary_sessions', 'sleep_diary_records', 'sleep_diary_smart_goals')
      `
    )
      .then((rows) => {
        const names = new Set(rows.map((row) => row.TABLE_NAME));
        return (
          names.has('sleep_diary_sessions') &&
          names.has('sleep_diary_records') &&
          names.has('sleep_diary_smart_goals')
        );
      })
      .catch((error) => {
        schemaReadyPromise = null;
        throw error;
      });
  }

  const ready = await schemaReadyPromise;
  if (!ready) {
    throw new AppError(
      500,
      'SCHEMA_MISMATCH',
      'sleep_diary tables are missing, please run migrations'
    );
  }
}

function toTimeHHmm(value) {
  if (!value) return null;
  return String(value).slice(0, 5);
}

function normalizeSmartGoalRecord(record) {
  if (!record) return null;

  return {
    id: record.id,
    session_id: record.session_id,
    user_id: record.user_id,
    sleep_hours_target: Number(record.sleep_hours_target),
    night_shift_nap_minutes_target: Number(record.night_shift_nap_minutes_target),
    breathing_frequency_days: Number(record.breathing_frequency_days),
    breathing_time: toTimeHHmm(record.breathing_time),
    caffeine_cutoff_hours: Number(record.caffeine_cutoff_hours),
    bedroom_adjustment_plan: record.bedroom_adjustment_plan || '',
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

async function getSmartGoalForSession(sessionId, userId) {
  const rows = await query(
    `
      SELECT *
      FROM sleep_diary_smart_goals
      WHERE session_id = ? AND user_id = ?
      LIMIT 1
    `,
    [sessionId, userId]
  );

  return normalizeSmartGoalRecord(rows[0] || null);
}

function minutesDistanceCircular(aMinutes, bMinutes) {
  const direct = Math.abs(aMinutes - bMinutes);
  return Math.min(direct, 24 * 60 - direct);
}

function evaluateSmartGoalForRecord(goal, record) {
  if (!goal || !record) return null;

  const bedtime = toTimeHHmm(record.bedtime);
  const lastCaffeineTime = toTimeHHmm(record.last_caffeine_time);
  const breathingTime = toTimeHHmm(record.breathing_478_time);
  const breathingGoalTime = toTimeHHmm(goal.breathing_time);

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

export async function getOrCreateCurrentSession(userId) {
  await ensureSleepDiarySchema();

  const rows = await query(
    `
      SELECT *
      FROM sleep_diary_sessions
      WHERE user_id = ? AND status = 'ACTIVE'
      LIMIT 1
    `,
    [userId]
  );

  if (rows[0]) {
    return rows[0];
  }

  const today = toDateOnly(new Date());
  const endDate = addDays(today, SESSION_TOTAL_DAYS - 1);

  const result = await query(
    `
      INSERT INTO sleep_diary_sessions (user_id, start_date, end_date, total_days, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `,
    [userId, today, endDate, SESSION_TOTAL_DAYS]
  );

  const created = await query('SELECT * FROM sleep_diary_sessions WHERE id = ? LIMIT 1', [result.insertId]);
  return created[0] || null;
}

function sessionDayState(session, dayNumber, todayString) {
  const expectedDate = addDays(toDateOnly(new Date(session.start_date)), dayNumber - 1);
  const availableDayCount = Math.min(
    SESSION_TOTAL_DAYS,
    Math.max(0, dateDiffInDays(toDateOnly(new Date(session.start_date)), todayString) + 1)
  );
  const isFuture = dayNumber > availableDayCount;
  const isToday = expectedDate === todayString;

  return {
    expectedDate,
    availableDayCount,
    isFuture,
    isToday,
    weekNumber: dayNumber <= 7 ? 1 : 2,
  };
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function toFixedOrNull(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(Number(value).toFixed(digits));
}

function buildSmartGoalCompletionSummary(records, smartGoal) {
  if (!smartGoal) return null;

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

  for (const record of records) {
    const daily = evaluateSmartGoalForRecord(smartGoal, record);
    if (!daily) continue;

    if (daily.achieved_count > 0) achievedAnyGoalDays += 1;
    if (daily.applicable_count > 0 && daily.achieved_count === daily.applicable_count) {
      achievedAllApplicableGoalDays += 1;
    }

    for (const check of daily.checks) {
      const bucket = totals[check.key];
      if (!bucket || !check.applicable) continue;
      bucket.applicable_days += 1;
      if (check.achieved === true) bucket.achieved_days += 1;
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
    total_recorded_days: records.length,
    achieved_any_goal_days: achievedAnyGoalDays,
    achieved_all_applicable_goal_days: achievedAllApplicableGoalDays,
    by_goal: byGoal,
  };
}

function buildSummary(records, smartGoal = null) {
  const completedDays = records.length;
  const seValues = records.filter((r) => r.sleep_efficiency != null).map((r) => Number(r.sleep_efficiency));

  const week1 = records.filter((r) => r.week_number === 1);
  const week2 = records.filter((r) => r.week_number === 2);

  const avgTstMinutes = avg(records.map((r) => Number(r.tst_minutes)));
  const avgTibMinutes = avg(records.map((r) => Number(r.tib_minutes)));

  return {
    completed_days: completedDays,
    total_days: SESSION_TOTAL_DAYS,
    avg_se: toFixedOrNull(avg(seValues), 1),
    weekly: {
      week_1: {
        completed_days: week1.length,
        total_days: 7,
        avg_se: toFixedOrNull(avg(week1.filter((r) => r.sleep_efficiency != null).map((r) => r.sleep_efficiency)), 1),
      },
      week_2: {
        completed_days: week2.length,
        total_days: 7,
        avg_se: toFixedOrNull(avg(week2.filter((r) => r.sleep_efficiency != null).map((r) => r.sleep_efficiency)), 1),
      },
    },
    completion: {
      is_completed: completedDays >= SESSION_TOTAL_DAYS,
      avg_tst_hours: toFixedOrNull((avgTstMinutes || 0) / 60, 1),
      avg_tib_hours: toFixedOrNull((avgTibMinutes || 0) / 60, 1),
      avg_sol_minutes: toFixedOrNull(avg(records.map((r) => r.sol_minutes)), 1),
      avg_waso_minutes: toFixedOrNull(avg(records.map((r) => r.waso_minutes)), 1),
      avg_sleep_quality: toFixedOrNull(avg(records.map((r) => r.sleep_quality)), 1),
      avg_morning_refreshment: toFixedOrNull(avg(records.map((r) => r.morning_refreshment)), 1),
      avg_shift_sleepiness: toFixedOrNull(avg(records.map((r) => r.shift_sleepiness)), 1),
      avg_work_stress: toFixedOrNull(avg(records.map((r) => r.work_stress)), 1),
      total_nap_days: records.filter((r) => Number(r.nap) === 1).length,
      avg_caffeine: toFixedOrNull(avg(records.map((r) => r.caffeine_cups)), 1),
      avg_phone_before_bed_minutes: toFixedOrNull(avg(records.map((r) => r.phone_before_bed_minutes)), 1),
      breathing_478_days: records.filter((r) => Number(r.breathing_478) === 1).length,
      smart_goal:
        completedDays >= SESSION_TOTAL_DAYS
          ? buildSmartGoalCompletionSummary(records, smartGoal)
          : null,
    },
  };
}

async function listRecordsBySession(sessionId) {
  return query(
    `
      SELECT *
      FROM sleep_diary_records
      WHERE session_id = ?
      ORDER BY day_number ASC
    `,
    [sessionId]
  );
}

export async function getDiaryDashboard(userId) {
  const session = await getOrCreateCurrentSession(userId);
  const [records, smartGoal] = await Promise.all([
    listRecordsBySession(session.id),
    getSmartGoalForSession(session.id, userId),
  ]);
  const today = toDateOnly(new Date());

  const byDay = new Map(records.map((record) => [record.day_number, record]));
  const days = Array.from({ length: SESSION_TOTAL_DAYS }).map((_, index) => {
    const dayNumber = index + 1;
    const state = sessionDayState(session, dayNumber, today);
    const record = byDay.get(dayNumber) || null;

    return {
      day_number: dayNumber,
      week_number: state.weekNumber,
      date: state.expectedDate,
      is_today: state.isToday,
      is_future: state.isFuture,
      can_edit: !state.isFuture,
      status: record ? 'COMPLETED' : state.isFuture ? 'FUTURE' : 'PENDING',
      sleep_efficiency: record?.sleep_efficiency ?? null,
      record,
      smart_goal_daily: record ? evaluateSmartGoalForRecord(smartGoal, record) : null,
    };
  });

  const summary = buildSummary(records, smartGoal);

  const activeDays = days.filter((day) => !day.is_future);

  return {
    session,
    today,
    available_day_count: activeDays.length,
    days,
    smart_goal: {
      configured: Boolean(smartGoal),
      goal: smartGoal,
    },
    summary,
  };
}

async function getOwnedRecord(sessionId, userId, dayNumber) {
  const rows = await query(
    `
      SELECT *
      FROM sleep_diary_records
      WHERE session_id = ? AND user_id = ? AND day_number = ?
      LIMIT 1
    `,
    [sessionId, userId, dayNumber]
  );

  return rows[0] || null;
}

function assertDayAccessible(session, dayNumber, wakeDate) {
  const today = toDateOnly(new Date());
  const state = sessionDayState(session, dayNumber, today);

  if (state.isFuture) {
    throw new AppError(400, 'DAY_NOT_AVAILABLE', 'Cannot fill future day');
  }

  if (wakeDate !== state.expectedDate) {
    throw new AppError(400, 'INVALID_WAKE_DATE', 'wake_date must match diary day');
  }

  if (wakeDate > today) {
    throw new AppError(400, 'INVALID_WAKE_DATE', 'wake_date cannot be in the future');
  }

  return state;
}

export async function getDiaryRecordByDay(userId, dayNumber) {
  const session = await getOrCreateCurrentSession(userId);
  const today = toDateOnly(new Date());
  const state = sessionDayState(session, dayNumber, today);

  const [record, smartGoal] = await Promise.all([
    getOwnedRecord(session.id, userId, dayNumber),
    getSmartGoalForSession(session.id, userId),
  ]);

  return {
    session,
    day_number: dayNumber,
    week_number: state.weekNumber,
    date: state.expectedDate,
    is_future: state.isFuture,
    is_today: state.isToday,
    status: record ? 'COMPLETED' : state.isFuture ? 'FUTURE' : 'PENDING',
    record,
    smart_goal: {
      configured: Boolean(smartGoal),
      goal: smartGoal,
    },
    smart_goal_daily: record ? evaluateSmartGoalForRecord(smartGoal, record) : null,
  };
}

export async function createDiaryRecordByDay(userId, dayNumber, input) {
  const session = await getOrCreateCurrentSession(userId);
  const state = assertDayAccessible(session, dayNumber, input.wake_date);
  const smartGoal = await getSmartGoalForSession(session.id, userId);

  if (!smartGoal) {
    throw new AppError(400, 'SMART_GOAL_REQUIRED', 'Please set SMART goal before filling sleep diary');
  }

  const existing = await getOwnedRecord(session.id, userId, dayNumber);
  if (existing) {
    throw new AppError(409, 'RECORD_ALREADY_EXISTS', 'Record already exists for this day');
  }

  const metrics = calculateSleepMetrics(input);

  const result = await query(
    `
      INSERT INTO sleep_diary_records (
        session_id,
        user_id,
        day_number,
        week_number,
        wake_date,
        shift_type,
        bedtime,
        attempt_sleep_time,
        sol_minutes,
        number_of_awakenings,
        waso_minutes,
        final_wake_time,
        get_up_time,
        sleep_after_final_wake_minutes,
        early_wake,
        tib_minutes,
        tst_minutes,
        sleep_efficiency,
        sleep_quality,
        morning_refreshment,
        shift_sleepiness,
        work_stress,
        ot_done,
        sleep_medication,
        nap_count,
        nap,
        nap_minutes,
        caffeine_cups,
        phone_before_bed_minutes,
        breathing_478,
        breathing_478_time,
        last_caffeine_time,
        bedroom_adjustment_done
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      session.id,
      userId,
      dayNumber,
      state.weekNumber,
      input.wake_date,
      input.shift_type,
      input.bedtime,
      input.attempt_sleep_time,
      input.sol_minutes,
      input.number_of_awakenings,
      input.waso_minutes,
      input.final_wake_time,
      input.get_up_time,
      input.sleep_after_final_wake_minutes,
      input.early_wake,
      metrics.tib_minutes,
      metrics.tst_minutes,
      metrics.sleep_efficiency,
      input.sleep_quality,
      input.morning_refreshment,
      input.shift_sleepiness,
      input.work_stress,
      input.ot_done,
      input.sleep_medication,
      input.nap_count,
      input.nap,
      input.nap_minutes,
      input.caffeine_cups,
      input.phone_before_bed_minutes,
      input.breathing_478,
      input.breathing_478_time,
      input.last_caffeine_time,
      input.bedroom_adjustment_done,
    ]
  );

  const created = await query('SELECT * FROM sleep_diary_records WHERE id = ? LIMIT 1', [result.insertId]);

  const completedRows = await listRecordsBySession(session.id);
  if (completedRows.length >= SESSION_TOTAL_DAYS) {
    await query(
      `
        UPDATE sleep_diary_sessions
        SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [session.id]
    );
  }

  const createdRecord = created[0] || null;

  return {
    record: createdRecord,
    smart_goal_daily: evaluateSmartGoalForRecord(smartGoal, createdRecord),
  };
}

export async function updateDiaryRecordByDay(userId, dayNumber, input) {
  const session = await getOrCreateCurrentSession(userId);
  const state = assertDayAccessible(session, dayNumber, input.wake_date);
  const smartGoal = await getSmartGoalForSession(session.id, userId);

  if (!smartGoal) {
    throw new AppError(400, 'SMART_GOAL_REQUIRED', 'Please set SMART goal before filling sleep diary');
  }

  const existing = await getOwnedRecord(session.id, userId, dayNumber);
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Record not found for this day');
  }

  const metrics = calculateSleepMetrics(input);

  await query(
    `
      UPDATE sleep_diary_records
      SET
        week_number = ?,
        wake_date = ?,
        shift_type = ?,
        bedtime = ?,
        attempt_sleep_time = ?,
        sol_minutes = ?,
        number_of_awakenings = ?,
        waso_minutes = ?,
        final_wake_time = ?,
        get_up_time = ?,
        sleep_after_final_wake_minutes = ?,
        early_wake = ?,
        tib_minutes = ?,
        tst_minutes = ?,
        sleep_efficiency = ?,
        sleep_quality = ?,
        morning_refreshment = ?,
        shift_sleepiness = ?,
        work_stress = ?,
        ot_done = ?,
        sleep_medication = ?,
        nap_count = ?,
        nap = ?,
        nap_minutes = ?,
        caffeine_cups = ?,
        phone_before_bed_minutes = ?,
        breathing_478 = ?,
        breathing_478_time = ?,
        last_caffeine_time = ?,
        bedroom_adjustment_done = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `,
    [
      state.weekNumber,
      input.wake_date,
      input.shift_type,
      input.bedtime,
      input.attempt_sleep_time,
      input.sol_minutes,
      input.number_of_awakenings,
      input.waso_minutes,
      input.final_wake_time,
      input.get_up_time,
      input.sleep_after_final_wake_minutes,
      input.early_wake,
      metrics.tib_minutes,
      metrics.tst_minutes,
      metrics.sleep_efficiency,
      input.sleep_quality,
      input.morning_refreshment,
      input.shift_sleepiness,
      input.work_stress,
      input.ot_done,
      input.sleep_medication,
      input.nap_count,
      input.nap,
      input.nap_minutes,
      input.caffeine_cups,
      input.phone_before_bed_minutes,
      input.breathing_478,
      input.breathing_478_time,
      input.last_caffeine_time,
      input.bedroom_adjustment_done,
      existing.id,
      userId,
    ]
  );

  const rows = await query('SELECT * FROM sleep_diary_records WHERE id = ? LIMIT 1', [existing.id]);
  const updatedRecord = rows[0] || null;

  return {
    record: updatedRecord,
    smart_goal_daily: evaluateSmartGoalForRecord(smartGoal, updatedRecord),
  };
}

export async function getSleepDiarySummary(userId) {
  const session = await getOrCreateCurrentSession(userId);
  const [records, smartGoal] = await Promise.all([
    listRecordsBySession(session.id),
    getSmartGoalForSession(session.id, userId),
  ]);
  return {
    session,
    smart_goal: {
      configured: Boolean(smartGoal),
      goal: smartGoal,
    },
    summary: buildSummary(records, smartGoal),
  };
}

export async function getSleepDiarySmartGoal(userId) {
  const session = await getOrCreateCurrentSession(userId);
  const goal = await getSmartGoalForSession(session.id, userId);

  return {
    session,
    configured: Boolean(goal),
    goal,
  };
}

export async function upsertSleepDiarySmartGoal(userId, input) {
  const session = await getOrCreateCurrentSession(userId);

  await query(
    `
      INSERT INTO sleep_diary_smart_goals (
        session_id,
        user_id,
        sleep_hours_target,
        night_shift_nap_minutes_target,
        breathing_frequency_days,
        breathing_time,
        caffeine_cutoff_hours,
        bedroom_adjustment_plan
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sleep_hours_target = VALUES(sleep_hours_target),
        night_shift_nap_minutes_target = VALUES(night_shift_nap_minutes_target),
        breathing_frequency_days = VALUES(breathing_frequency_days),
        breathing_time = VALUES(breathing_time),
        caffeine_cutoff_hours = VALUES(caffeine_cutoff_hours),
        bedroom_adjustment_plan = VALUES(bedroom_adjustment_plan),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      session.id,
      userId,
      input.sleep_hours_target,
      input.night_shift_nap_minutes_target,
      input.breathing_frequency_days,
      input.breathing_time,
      input.caffeine_cutoff_hours,
      input.bedroom_adjustment_plan,
    ]
  );

  const goal = await getSmartGoalForSession(session.id, userId);

  return {
    session,
    configured: Boolean(goal),
    goal,
  };
}

export function previewSleepMetrics(input) {
  return calculateSleepMetrics(input);
}