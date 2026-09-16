import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

import { LESSON_KEYS, QUIZ_TYPES } from '../validators/knowledge-validator.js';

const INTRO_UNLOCK_PERCENT = 90;

const LESSON_META = {
  lesson1: {
    key: 'lesson1',
    title: 'กิจกรรมที่ 1 Sleep Education',
    video_path: '/learn/lesson1/lesson1.mp4',
    pdf_path: '/learn/lesson1/lesson1.pdf',
  },
  lesson2: {
    key: 'lesson2',
    title: 'กิจกรรมที่ 2 Diaphragm Breathing',
    video_path: '/learn/lesson2/lesson2.mp4',
    pdf_path: '/learn/lesson2/lesson2.pdf',
  },
  lesson3: {
    key: 'lesson3',
    title: 'กิจกรรมที่ 3 Risk Reduction',
    video_path: '/learn/lesson3/lesson3.mp4',
    pdf_path: '/learn/lesson3/lesson3.pdf',
  },
  lesson4: {
    key: 'lesson4',
    title: 'กิจกรรมที่ 3 Risk Reduction',
    video_path: '/learn/lesson4/lesson4.mp4',
    pdf_path: '/learn/lesson4/lesson4.pdf',
  },
};

const QUIZ_QUESTIONS = [
  { id: 1, answer: '7-9 ชั่วโมง' },
  { id: 2, answer: 'เมลาโทนิน' },
  { id: 3, answer: '90-110 นาที' },
  { id: 4, answer: 'REM Sleep' },
  { id: 5, answer: 'ความเสี่ยงโรคหัวใจเพิ่มขึ้น' },
  { id: 6, answer: '5-7 ชั่วโมง' },
  { id: 7, answer: '25-28°C' },
  { id: 8, answer: 'ยับยั้งการหลั่งเมลาโทนิน ทำให้หลับยากขึ้น' },
  {
    id: 9,
    answer: 'พฤติกรรมและสภาพแวดล้อมที่ส่งเสริมการนอนหลับที่มีคุณภาพ',
  },
  { id: 10, answer: '15-20 นาที' },
];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(toNumber(value, 0).toFixed(2))));
}

function normalizeIntro(row) {
  const watchedPercent = clampPercent(row?.watched_percent || 0);
  const unlocked = watchedPercent >= INTRO_UNLOCK_PERCENT || Number(row?.unlocked || 0) === 1;

  return {
    watched_percent: watchedPercent,
    threshold_percent: INTRO_UNLOCK_PERCENT,
    unlocked,
    last_watched_at: row?.last_watched_at || null,
    completed_at: row?.completed_at || null,
  };
}

function normalizeLesson(row, meta) {
  const videoPercent = clampPercent(row?.video_watched_percent || 0);
  const videoCompleted = Number(row?.video_completed || 0) === 1;
  const pdfOpened = Number(row?.pdf_opened || 0) === 1;
  const completed = Number(row?.is_completed || 0) === 1 || (videoCompleted && pdfOpened);

  return {
    key: meta.key,
    title: meta.title,
    video_path: meta.video_path,
    pdf_path: meta.pdf_path,
    video_watched_percent: videoPercent,
    video_completed: videoCompleted,
    pdf_opened: pdfOpened,
    is_completed: completed,
    video_completed_at: row?.video_completed_at || null,
    pdf_opened_at: row?.pdf_opened_at || null,
    completed_at: row?.completed_at || null,
  };
}

function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeQuizAttempt(row) {
  if (!row) return null;

  return {
    id: row.id,
    quiz_type: row.quiz_type,
    score: Number(row.score || 0),
    total_questions: Number(row.total_questions || QUIZ_QUESTIONS.length),
    percent: Number(Number(row.percent || 0).toFixed(1)),
    submitted_at: row.submitted_at || null,
    answers: safeJsonParse(row.answers_json, {}),
    result: safeJsonParse(row.result_json, []),
  };
}

function evaluateQuizAnswers(answers) {
  const normalizedAnswers = answers || {};
  const missing = QUIZ_QUESTIONS.filter((item) => !normalizedAnswers[String(item.id)]);

  if (missing.length > 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Please answer all questions before submit (missing: ${missing.map((item) => item.id).join(', ')})`
    );
  }

  let score = 0;
  const result = QUIZ_QUESTIONS.map((item) => {
    const selected = String(normalizedAnswers[String(item.id)] || '').trim();
    const isCorrect = selected === item.answer;
    if (isCorrect) score += 1;

    return {
      id: item.id,
      selected,
      correct: item.answer,
      is_correct: isCorrect,
    };
  });

  return {
    score,
    total_questions: QUIZ_QUESTIONS.length,
    percent: Number(((score / QUIZ_QUESTIONS.length) * 100).toFixed(1)),
    result,
  };
}

async function getIntroRow(userId) {
  const rows = await query(
    `
      SELECT *
      FROM learning_intro_progress
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

async function getLessonRows(userId) {
  return query(
    `
      SELECT *
      FROM learning_lesson_progress
      WHERE user_id = ?
    `,
    [userId]
  );
}

async function getLatestQuizAttemptByType(userId) {
  const rows = await query(
    `
      SELECT q.*
      FROM learning_quiz_attempts q
      INNER JOIN (
        SELECT quiz_type, MAX(id) AS max_id
        FROM learning_quiz_attempts
        WHERE user_id = ?
        GROUP BY quiz_type
      ) x ON x.max_id = q.id
      WHERE q.user_id = ?
    `,
    [userId, userId]
  );

  const byType = new Map(rows.map((row) => [String(row.quiz_type), normalizeQuizAttempt(row)]));

  return {
    PRETEST: byType.get('PRETEST') || null,
    POSTTEST: byType.get('POSTTEST') || null,
  };
}

async function ensureLessonRow(userId, lessonKey) {
  await query(
    `
      INSERT IGNORE INTO learning_lesson_progress (
        user_id,
        lesson_key,
        video_watched_percent,
        video_completed,
        pdf_opened,
        is_completed
      ) VALUES (?, ?, 0, 0, 0, 0)
    `,
    [userId, lessonKey]
  );
}

async function getLessonRow(userId, lessonKey) {
  const rows = await query(
    `
      SELECT *
      FROM learning_lesson_progress
      WHERE user_id = ? AND lesson_key = ?
      LIMIT 1
    `,
    [userId, lessonKey]
  );

  return rows[0] || null;
}

function toKnowledgePayload(introRow, lessonRows, quiz) {
  const intro = normalizeIntro(introRow);
  const byKey = new Map(lessonRows.map((row) => [String(row.lesson_key), row]));

  const lessons = LESSON_KEYS.map((key) => normalizeLesson(byKey.get(key), LESSON_META[key]));
  const completedLessons = lessons.filter((item) => item.is_completed).length;

  return {
    intro,
    lessons,
    quiz: {
      pretest: quiz?.PRETEST || null,
      posttest: quiz?.POSTTEST || null,
      gain_score:
        quiz?.PRETEST && quiz?.POSTTEST
          ? Number(quiz.POSTTEST.score || 0) - Number(quiz.PRETEST.score || 0)
          : null,
    },
    summary: {
      total_lessons: LESSON_KEYS.length,
      completed_lessons: completedLessons,
      completion_percent:
        LESSON_KEYS.length > 0
          ? Number(((completedLessons / LESSON_KEYS.length) * 100).toFixed(1))
          : 0,
      unlocked_lessons: intro.unlocked ? LESSON_KEYS.length : 0,
    },
  };
}

async function ensureIntroUnlocked(userId) {
  const intro = normalizeIntro(await getIntroRow(userId));
  if (!intro.unlocked) {
    throw new AppError(
      400,
      'INTRO_REQUIRED',
      `Please watch intro video at least ${INTRO_UNLOCK_PERCENT}% before starting lessons`
    );
  }
}

export async function getKnowledgeProgress(userId) {
  const [introRow, lessonRows, quiz] = await Promise.all([
    getIntroRow(userId),
    getLessonRows(userId),
    getLatestQuizAttemptByType(userId),
  ]);
  return toKnowledgePayload(introRow, lessonRows, quiz);
}

export async function saveKnowledgeIntroProgress(userId, input) {
  const watchedPercent = clampPercent(input.watched_percent);
  const unlocked = watchedPercent >= INTRO_UNLOCK_PERCENT ? 1 : 0;

  await query(
    `
      INSERT INTO learning_intro_progress (
        user_id,
        watched_percent,
        unlocked,
        last_watched_at,
        completed_at
      ) VALUES (
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP,
        CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      ON DUPLICATE KEY UPDATE
        watched_percent = GREATEST(watched_percent, VALUES(watched_percent)),
        unlocked = IF(GREATEST(watched_percent, VALUES(watched_percent)) >= ?, 1, unlocked),
        last_watched_at = CURRENT_TIMESTAMP,
        completed_at = CASE
          WHEN completed_at IS NULL AND GREATEST(watched_percent, VALUES(watched_percent)) >= ?
            THEN CURRENT_TIMESTAMP
          ELSE completed_at
        END,
        updated_at = CURRENT_TIMESTAMP
    `,
    [userId, watchedPercent, unlocked, unlocked, INTRO_UNLOCK_PERCENT, INTRO_UNLOCK_PERCENT]
  );

  return getKnowledgeProgress(userId);
}

export async function saveKnowledgeLessonVideoProgress(userId, lessonKey, input) {
  await ensureIntroUnlocked(userId);
  await ensureLessonRow(userId, lessonKey);

  const current = await getLessonRow(userId, lessonKey);
  if (!current) {
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Unable to save lesson progress');
  }

  const watchedPercent = Math.max(
    clampPercent(current.video_watched_percent || 0),
    clampPercent(input.watched_percent)
  );
  const completed =
    Number(current.video_completed || 0) === 1 ||
    Boolean(input.completed) ||
    watchedPercent >= 99.5;
  const pdfOpened = Number(current.pdf_opened || 0) === 1;
  const lessonCompleted = completed && pdfOpened;

  await query(
    `
      UPDATE learning_lesson_progress
      SET
        video_watched_percent = ?,
        video_completed = ?,
        video_completed_at = CASE
          WHEN ? = 1 AND video_completed_at IS NULL THEN CURRENT_TIMESTAMP
          ELSE video_completed_at
        END,
        is_completed = ?,
        completed_at = CASE
          WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP
          ELSE completed_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND lesson_key = ?
    `,
    [watchedPercent, completed ? 1 : 0, completed ? 1 : 0, lessonCompleted ? 1 : 0, lessonCompleted ? 1 : 0, userId, lessonKey]
  );

  return getKnowledgeProgress(userId);
}

export async function markKnowledgeLessonPdfOpened(userId, lessonKey) {
  await ensureIntroUnlocked(userId);
  await ensureLessonRow(userId, lessonKey);

  const current = await getLessonRow(userId, lessonKey);
  if (!current) {
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Unable to save lesson progress');
  }

  const videoCompleted = Number(current.video_completed || 0) === 1;
  const lessonCompleted = videoCompleted;

  await query(
    `
      UPDATE learning_lesson_progress
      SET
        pdf_opened = 1,
        pdf_opened_at = CASE WHEN pdf_opened_at IS NULL THEN CURRENT_TIMESTAMP ELSE pdf_opened_at END,
        is_completed = CASE WHEN ? = 1 THEN 1 ELSE is_completed END,
        completed_at = CASE
          WHEN ? = 1 AND completed_at IS NULL THEN CURRENT_TIMESTAMP
          ELSE completed_at
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND lesson_key = ?
    `,
    [lessonCompleted ? 1 : 0, lessonCompleted ? 1 : 0, userId, lessonKey]
  );

  return getKnowledgeProgress(userId);
}

export async function submitKnowledgeQuiz(userId, input) {
  if (!QUIZ_TYPES.includes(input.quiz_type)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid quiz type');
  }

  const evaluated = evaluateQuizAnswers(input.answers);

  await query(
    `
      INSERT INTO learning_quiz_attempts (
        user_id,
        quiz_type,
        score,
        total_questions,
        percent,
        answers_json,
        result_json,
        submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    [
      userId,
      input.quiz_type,
      evaluated.score,
      evaluated.total_questions,
      evaluated.percent,
      JSON.stringify(input.answers || {}),
      JSON.stringify(evaluated.result || []),
    ]
  );

  return getKnowledgeProgress(userId);
}

export function getKnowledgeLessonMeta() {
  return LESSON_KEYS.map((key) => LESSON_META[key]);
}

export { INTRO_UNLOCK_PERCENT };
