import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROUND_2_WAIT_DAYS = 49;

let schemaReadyPromise;

function toDateOnly(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utcDate.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return toDateOnly(new Date(date.getTime() + days * DAY_MS));
}

function buildInterpretation(totalScore) {
  if (totalScore <= 5) {
    return 'มีคุณภาพการนอนหลับที่ดี|คะแนนรวมไม่เกิน 5 คะแนน อยู่ในเกณฑ์การนอนหลับที่ดี';
  }

  return 'มีคุณภาพการนอนหลับที่ไม่ดี (Poor Sleeper)|คะแนนรวมมากกว่า 5 คะแนน จัดอยู่ในกลุ่มที่มีปัญหาคุณภาพการนอนหลับ';
}

function normalizeComponentFromSum(sum) {
  if (sum <= 0) return 0;
  if (sum <= 2) return 1;
  if (sum <= 4) return 2;
  return 3;
}

function normalizeDisturbanceComponent(sum) {
  if (sum <= 0) return 0;
  if (sum <= 9) return 1;
  if (sum <= 18) return 2;
  return 3;
}

function parseTimeToMinutes(value) {
  const [hourRaw, minuteRaw] = String(value).split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  return hour * 60 + minute;
}

function sleepLatencyScore(minutes) {
  if (minutes <= 15) return 0;
  if (minutes <= 30) return 1;
  if (minutes <= 60) return 2;
  return 3;
}

function sleepDurationScore(hours) {
  if (hours > 7) return 0;
  if (hours >= 6) return 1;
  if (hours >= 5) return 2;
  return 3;
}

function sleepEfficiencyScore(hoursSlept, bedtime, wakeTime) {
  const bedtimeMinutes = parseTimeToMinutes(bedtime);
  const wakeMinutes = parseTimeToMinutes(wakeTime);
  const timeInBedMinutes =
    wakeMinutes >= bedtimeMinutes
      ? wakeMinutes - bedtimeMinutes
      : 24 * 60 - bedtimeMinutes + wakeMinutes;

  if (timeInBedMinutes <= 0) {
    return 3;
  }

  const efficiency = (hoursSlept * 60 * 100) / timeInBedMinutes;

  if (efficiency > 85) return 0;
  if (efficiency >= 75) return 1;
  if (efficiency >= 65) return 2;
  return 3;
}

export function calculatePSQI(answers) {
  const component1 = answers.q6;

  const latencyScore = sleepLatencyScore(answers.sleep_latency_minutes);
  const component2 = normalizeComponentFromSum(latencyScore + answers.q5_1);

  const component3 = sleepDurationScore(answers.sleep_duration_hours);

  const component4 = sleepEfficiencyScore(
    answers.sleep_duration_hours,
    answers.bedtime,
    answers.wake_time
  );

  const disturbanceSum =
    answers.q5_2 +
    answers.q5_3 +
    answers.q5_4 +
    answers.q5_5 +
    answers.q5_6 +
    answers.q5_7 +
    answers.q5_8 +
    answers.q5_9 +
    answers.q5_10;
  const component5 = normalizeDisturbanceComponent(disturbanceSum);

  const component6 = answers.q7;
  const component7 = normalizeComponentFromSum(answers.q8 + answers.q9);

  const totalScore =
    component1 + component2 + component3 + component4 + component5 + component6 + component7;

  return {
    component_1: component1,
    component_2: component2,
    component_3: component3,
    component_4: component4,
    component_5: component5,
    component_6: component6,
    component_7: component7,
    total_score: totalScore,
    interpretation: buildInterpretation(totalScore),
  };
}

async function ensureAssessmentSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(
      `
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_assessments'
        LIMIT 1
      `
    )
      .then((rows) => rows.length > 0)
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
      'user_assessments table is missing, please run migrations'
    );
  }
}

function toRoundLabel(round) {
  if (round === 1) return 'การประเมินครั้งที่ 1 - สัปดาห์ที่ 1';
  if (round === 2) return 'การประเมินครั้งที่ 2 - สัปดาห์ที่ 8';
  return null;
}

function buildAssessmentHistory(records) {
  return [...records]
    .sort((a, b) => Number(b.assessment_round) - Number(a.assessment_round))
    .map((record) => ({
      id: record.id,
      assessment_round: record.assessment_round,
      round_label: toRoundLabel(record.assessment_round),
      assessment_date: record.assessment_date,
      total_score: record.total_score,
      interpretation: record.interpretation,
      component_1: record.component_1,
      component_2: record.component_2,
      component_3: record.component_3,
      component_4: record.component_4,
      component_5: record.component_5,
      component_6: record.component_6,
      component_7: record.component_7,
    }));
}

export async function getAssessmentTimeline(userId) {
  await ensureAssessmentSchema();

  const records = await query(
    `
      SELECT *
      FROM user_assessments
      WHERE user_id = ?
      ORDER BY assessment_round ASC
    `,
    [userId]
  );

  const round1 = records.find((item) => item.assessment_round === 1) || null;
  const round2 = records.find((item) => item.assessment_round === 2) || null;
  const latest = records[records.length - 1] || null;
  const assessmentHistory = buildAssessmentHistory(records);

  if (!round1) {
    return {
      status: 'READY',
      current_round: 1,
      round_label: toRoundLabel(1),
      next_available_date: null,
      latest_assessment: latest,
      assessment_history: assessmentHistory,
    };
  }

  if (!round2) {
    const eligibleDate = addDays(toDateOnly(new Date(round1.assessment_date)), ROUND_2_WAIT_DAYS);
    const today = toDateOnly(new Date());

    if (today >= eligibleDate) {
      return {
        status: 'READY',
        current_round: 2,
        round_label: toRoundLabel(2),
        next_available_date: eligibleDate,
        latest_assessment: latest,
        assessment_history: assessmentHistory,
      };
    }

    return {
      status: 'WAITING_NEXT_ROUND',
      current_round: null,
      round_label: null,
      next_available_date: eligibleDate,
      latest_assessment: latest,
      assessment_history: assessmentHistory,
    };
  }

  return {
    status: 'COMPLETED',
    current_round: null,
    round_label: null,
    next_available_date: null,
    latest_assessment: latest,
    assessment_history: assessmentHistory,
  };
}

function buildReferenceRange() {
  const end = toDateOnly(new Date());
  const start = addDays(end, -29);
  return {
    reference_start_date: start,
    reference_end_date: end,
    assessment_date: end,
  };
}

export async function submitAssessment(userId, answers) {
  await ensureAssessmentSchema();

  const timeline = await getAssessmentTimeline(userId);
  if (timeline.status !== 'READY' || !timeline.current_round) {
    throw new AppError(409, 'ASSESSMENT_NOT_READY', 'Assessment round is not available yet');
  }

  const existing = await query(
    `
      SELECT id
      FROM user_assessments
      WHERE user_id = ? AND assessment_round = ?
      LIMIT 1
    `,
    [userId, timeline.current_round]
  );

  if (existing[0]) {
    throw new AppError(409, 'ASSESSMENT_ALREADY_SUBMITTED', 'Assessment already submitted for this round');
  }

  const score = calculatePSQI(answers);
  const ref = buildReferenceRange();
  const passed = Number(score.total_score) > 5;

  if (!passed) {
    return {
      assessment_saved: false,
      passed: false,
      cutoff_score: 5,
      total_score: score.total_score,
      interpretation: score.interpretation,
      assessment_round: timeline.current_round,
      assessment_date: ref.assessment_date,
      record: null,
    };
  }

  const result = await query(
    `
      INSERT INTO user_assessments (
        user_id,
        assessment_round,
        assessment_date,
        reference_start_date,
        reference_end_date,
        bedtime,
        sleep_latency_minutes,
        wake_time,
        sleep_duration_hours,
        q5_1,
        q5_2,
        q5_3,
        q5_4,
        q5_5,
        q5_6,
        q5_7,
        q5_8,
        q5_9,
        q5_9_detail,
        q5_10,
        q5_10_detail,
        q6,
        q7,
        q8,
        q9,
        q10,
        q10_1,
        q10_2,
        q10_3,
        q10_4,
        q10_5,
        q10_5_detail,
        component_1,
        component_2,
        component_3,
        component_4,
        component_5,
        component_6,
        component_7,
        total_score,
        interpretation
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      timeline.current_round,
      ref.assessment_date,
      ref.reference_start_date,
      ref.reference_end_date,
      answers.bedtime,
      answers.sleep_latency_minutes,
      answers.wake_time,
      answers.sleep_duration_hours,
      answers.q5_1,
      answers.q5_2,
      answers.q5_3,
      answers.q5_4,
      answers.q5_5,
      answers.q5_6,
      answers.q5_7,
      answers.q5_8,
      answers.q5_9,
      answers.q5_9_detail,
      answers.q5_10,
      answers.q5_10_detail,
      answers.q6,
      answers.q7,
      answers.q8,
      answers.q9,
      answers.q10,
      answers.q10_1,
      answers.q10_2,
      answers.q10_3,
      answers.q10_4,
      answers.q10_5,
      answers.q10_5_detail,
      score.component_1,
      score.component_2,
      score.component_3,
      score.component_4,
      score.component_5,
      score.component_6,
      score.component_7,
      score.total_score,
      score.interpretation,
    ]
  );

  const rows = await query('SELECT * FROM user_assessments WHERE id = ? LIMIT 1', [result.insertId]);
  const record = rows[0] || null;

  return {
    assessment_saved: true,
    passed: true,
    cutoff_score: 5,
    ...record,
    round_label: toRoundLabel(record?.assessment_round),
    record,
  };
}