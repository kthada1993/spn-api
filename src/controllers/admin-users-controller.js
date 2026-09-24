import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';
import { validateAdminUserUpdateInput } from '../validators/admin-user-validator.js';

async function loadSchemaFlags() {
  const rows = await query(
    `
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'user_screenings'
            AND COLUMN_NAME = 'study_group'
        ) AS has_study_group,
        EXISTS (
          SELECT 1
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'admin_matching_pairs'
        ) AS has_matching_pairs_table
    `
  );

  return {
    hasStudyGroup: Number(rows?.[0]?.has_study_group) === 1,
    hasMatchingPairsTable: Number(rows?.[0]?.has_matching_pairs_table) === 1,
  };
}

function toNumberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDepartmentContext(name) {
  const raw = String(name || '').trim().toLowerCase();
  if (!raw) return 'UNKNOWN';

  if (raw.includes('อายุรกรรม')) return 'INTERNAL';
  if (raw.includes('ศัลยกรรม')) return 'SURGERY';
  if (raw.includes('กุมารเวช')) return 'PEDIATRIC';
  if (raw.includes('สูติ') || raw.includes('นรี')) return 'OBGYN';
  if (raw.includes('semi icu') || raw.includes('semi-icu') || raw.includes('icu') || raw.includes('วิกฤต')) return 'ICU';
  if (raw === 'er' || raw.includes('er ') || raw.includes('ฉุกเฉิน') || raw.includes('อุบัติเหตุ')) return 'ER';

  return `RAW:${raw}`;
}

function isDepartmentCompatible(expContext, ctrlContext) {
  if (!expContext || !ctrlContext) return false;

  if (expContext === ctrlContext && expContext !== 'UNKNOWN') return true;
  if (expContext.startsWith('RAW:') || ctrlContext.startsWith('RAW:')) return expContext === ctrlContext;
  if (expContext === 'UNKNOWN' || ctrlContext === 'UNKNOWN') return false;

  if (expContext === 'SURGERY' && (ctrlContext === 'SURGERY' || ctrlContext === 'PEDIATRIC')) return true;
  if (expContext === 'PEDIATRIC' && (ctrlContext === 'SURGERY' || ctrlContext === 'PEDIATRIC')) return true;

  return false;
}

function hasRequiredFields(user) {
  return user.gender != null && user.age != null && user.psqi_round1_score != null && user.department_context;
}

function computeChange(before, after) {
  if (before == null || after == null) return null;
  return Number((after - before).toFixed(2));
}

function changeDirectionLabel(change) {
  if (change == null) return 'ข้อมูลไม่ครบ';
  if (change < 0) return 'ดีขึ้น (Improved)';
  if (change > 0) return 'แย่ลง (Worse)';
  return 'คงเดิม (No change)';
}

const OUTCOME_META = [
  { key: 'psqi_total', label: 'Thai-PSQI Total' },
  { key: 'c1', label: 'C1 Sleep Quality' },
  { key: 'c2', label: 'C2 Sleep Latency' },
  { key: 'c3', label: 'C3 Sleep Duration' },
  { key: 'c4', label: 'C4 Sleep Efficiency' },
  { key: 'c5', label: 'C5 Sleep Disturbance' },
  { key: 'c6', label: 'C6 Sleep Medication' },
  { key: 'c7', label: 'C7 Daytime Dysfunction' },
];

function buildMetricMap(user) {
  return {
    psqi_total: { before: user.psqi_round1_score, after: user.psqi_round8_score },
    c1: { before: user.week1_component_1, after: user.week8_component_1 },
    c2: { before: user.week1_component_2, after: user.week8_component_2 },
    c3: { before: user.week1_component_3, after: user.week8_component_3 },
    c4: { before: user.week1_component_4, after: user.week8_component_4 },
    c5: { before: user.week1_component_5, after: user.week8_component_5 },
    c6: { before: user.week1_component_6, after: user.week8_component_6 },
    c7: { before: user.week1_component_7, after: user.week8_component_7 },
  };
}

function buildOutcomeRows(exp, ctrl) {
  const expMap = buildMetricMap(exp);
  const ctrlMap = buildMetricMap(ctrl);

  return OUTCOME_META.map((meta) => {
    const expBefore = expMap[meta.key]?.before ?? null;
    const expAfter = expMap[meta.key]?.after ?? null;
    const ctrlBefore = ctrlMap[meta.key]?.before ?? null;
    const ctrlAfter = ctrlMap[meta.key]?.after ?? null;

    const expChange = computeChange(expBefore, expAfter);
    const ctrlChange = computeChange(ctrlBefore, ctrlAfter);
    const diffInChange =
      expChange == null || ctrlChange == null ? null : Number((expChange - ctrlChange).toFixed(2));

    return {
      key: meta.key,
      label: meta.label,
      experimental_before: expBefore,
      experimental_after: expAfter,
      experimental_change: expChange,
      control_before: ctrlBefore,
      control_after: ctrlAfter,
      control_change: ctrlChange,
      difference_in_change: diffInChange,
    };
  });
}

function computePairCandidate(exp, ctrl) {
  if (!hasRequiredFields(exp) || !hasRequiredFields(ctrl)) return null;
  if (!(exp.psqi_round1_score > 5 && ctrl.psqi_round1_score > 5)) return null;
  if (exp.gender !== ctrl.gender) return null;

  const ageDiff = Math.abs(exp.age - ctrl.age);
  if (ageDiff > 5) return null;

  const psqiDiff = Math.abs(exp.psqi_round1_score - ctrl.psqi_round1_score);
  if (psqiDiff > 2) return null;

  if (!isDepartmentCompatible(exp.department_context, ctrl.department_context)) return null;

  const departmentBonus = exp.department_context === ctrl.department_context ? 0 : 0.25;

  return {
    ageDiff,
    psqiDiff,
    score: ageDiff + psqiDiff + departmentBonus,
  };
}

function buildPairResponse(exp, ctrl, candidate, options = {}) {
  const expChange = computeChange(exp.psqi_round1_score, exp.psqi_round8_score);
  const ctrlChange = computeChange(ctrl.psqi_round1_score, ctrl.psqi_round8_score);
  const pairDifference =
    expChange == null || ctrlChange == null ? null : Number((expChange - ctrlChange).toFixed(2));
  const compared = expChange != null && ctrlChange != null;
  const different = compared ? expChange !== ctrlChange : null;
  const outcomeRows = buildOutcomeRows(exp, ctrl);

  return {
    experimental: exp,
    control: ctrl,
    is_confirmed: Boolean(options.isConfirmed),
    confirmed_at: options.confirmedAt || null,
    criteria: {
      gender_same: true,
      age_diff: candidate.ageDiff,
      age_diff_max: 5,
      psqi_experimental: exp.psqi_round1_score,
      psqi_control: ctrl.psqi_round1_score,
      psqi_diff: candidate.psqiDiff,
      psqi_diff_max: 2,
      psqi_min: 5,
      department_experimental: exp.department_name,
      department_control: ctrl.department_name,
    },
    outcome: {
      compared,
      different,
      pair_difference: pairDifference,
      verdict: !compared ? 'ข้อมูลไม่ครบ (Insufficient)' : different ? 'ต่างกัน (Different)' : 'ไม่ต่างกัน (No difference)',
      experimental: {
        week1: exp.psqi_round1_score,
        week8: exp.psqi_round8_score,
        change: expChange,
        direction: changeDirectionLabel(expChange),
      },
      control: {
        week1: ctrl.psqi_round1_score,
        week8: ctrl.psqi_round8_score,
        change: ctrlChange,
        direction: changeDirectionLabel(ctrlChange),
      },
      rows: outcomeRows,
    },
  };
}

function findUserById(items, userId) {
  return items.find((item) => Number(item.user_id) === Number(userId)) || null;
}

async function loadMatchingBaseRows() {
  const rows = await query(
    `
      SELECT
        u.id,
        u.code_id,
        u.display_name,
        s.study_group,
        s.gender,
        s.age,
        s.department_id,
        d.name AS department_name,
        a1.total_score AS psqi_round1_score,
        a1.component_1 AS week1_component_1,
        a1.component_2 AS week1_component_2,
        a1.component_3 AS week1_component_3,
        a1.component_4 AS week1_component_4,
        a1.component_5 AS week1_component_5,
        a1.component_6 AS week1_component_6,
        a1.component_7 AS week1_component_7,
        a8.total_score AS psqi_round8_score,
        a8.component_1 AS week8_component_1,
        a8.component_2 AS week8_component_2,
        a8.component_3 AS week8_component_3,
        a8.component_4 AS week8_component_4,
        a8.component_5 AS week8_component_5,
        a8.component_6 AS week8_component_6,
        a8.component_7 AS week8_component_7
      FROM users u
      INNER JOIN user_screenings s ON s.user_id = u.id
      LEFT JOIN master_departments d ON d.id = s.department_id
      LEFT JOIN user_assessments a1 ON a1.user_id = u.id AND a1.assessment_round = 1
      LEFT JOIN user_assessments a8 ON a8.user_id = u.id AND a8.assessment_round = 2
      WHERE s.study_group IN (2, 3)
        AND u.approval_status = 'APPROVED'
    `
  );

  return rows.map((row) => ({
    user_id: Number(row.id),
    code_id: row.code_id || null,
    display_name: row.display_name || null,
    study_group: Number(row.study_group),
    gender: toNumberOrNull(row.gender),
    age: toNumberOrNull(row.age),
    department_id: toNumberOrNull(row.department_id),
    department_name: row.department_name || null,
    department_context: normalizeDepartmentContext(row.department_name),
    psqi_round1_score: toNumberOrNull(row.psqi_round1_score),
    week1_component_1: toNumberOrNull(row.week1_component_1),
    week1_component_2: toNumberOrNull(row.week1_component_2),
    week1_component_3: toNumberOrNull(row.week1_component_3),
    week1_component_4: toNumberOrNull(row.week1_component_4),
    week1_component_5: toNumberOrNull(row.week1_component_5),
    week1_component_6: toNumberOrNull(row.week1_component_6),
    week1_component_7: toNumberOrNull(row.week1_component_7),
    psqi_round8_score: toNumberOrNull(row.psqi_round8_score),
    week8_component_1: toNumberOrNull(row.week8_component_1),
    week8_component_2: toNumberOrNull(row.week8_component_2),
    week8_component_3: toNumberOrNull(row.week8_component_3),
    week8_component_4: toNumberOrNull(row.week8_component_4),
    week8_component_5: toNumberOrNull(row.week8_component_5),
    week8_component_6: toNumberOrNull(row.week8_component_6),
    week8_component_7: toNumberOrNull(row.week8_component_7),
  }));
}

export const listAdminUsers = asyncHandler(async (req, res) => {
  const schemaFlags = await loadSchemaFlags();

  const users = await query(
    `
      SELECT
        u.id,
        u.code_id,
        u.display_name,
        u.email,
        u.line_user_id,
        u.status,
        u.approval_status,
        u.last_login_at,
        u.created_at,
        s.screening_result,
        s.inclusion_result,
        s.exclusion_result,
        ${schemaFlags.hasStudyGroup ? 's.study_group' : 'NULL AS study_group'},
        s.updated_at AS screening_updated_at
      FROM users u
      LEFT JOIN user_screenings s ON s.user_id = u.id
      ORDER BY u.created_at DESC
    `
  );

  return ok(res, {
    total: users.length,
    items: users,
  });
});

export const updateAdminUser = asyncHandler(async (req, res) => {
  const schemaFlags = await loadSchemaFlags();

  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid user id');
  }

  const userRows = await query('SELECT id, display_name FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!userRows[0]) {
    throw new AppError(404, 'NOT_FOUND', 'User not found');
  }

  const input = validateAdminUserUpdateInput(req.body);

  if (input.approval_status !== undefined) {
    await query('UPDATE users SET approval_status = ? WHERE id = ?', [input.approval_status, userId]);
  }

  if (input.study_group !== undefined) {
    if (!schemaFlags.hasStudyGroup) {
      throw new AppError(500, 'SCHEMA_MISMATCH', 'study_group column is missing, please run migrations');
    }

    await query(
      `
        INSERT INTO user_screenings (user_id, full_name, hospital_id, department_id, study_group)
        VALUES (?, ?, NULL, NULL, ?)
        ON DUPLICATE KEY UPDATE
          study_group = VALUES(study_group),
          updated_at = CURRENT_TIMESTAMP
      `,
      [userId, userRows[0].display_name || '', input.study_group]
    );
  }

  const rows = await query(
    `
      SELECT
        u.id,
        u.code_id,
        u.display_name,
        u.email,
        u.line_user_id,
        u.status,
        u.approval_status,
        u.last_login_at,
        u.created_at,
        s.screening_result,
        s.inclusion_result,
        s.exclusion_result,
        ${schemaFlags.hasStudyGroup ? 's.study_group' : 'NULL AS study_group'},
        s.updated_at AS screening_updated_at
      FROM users u
      LEFT JOIN user_screenings s ON s.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
    `,
    [userId]
  );

  return ok(res, rows[0]);
});

export const listAdminUserMatchingSuggestions = asyncHandler(async (req, res) => {
  const schemaFlags = await loadSchemaFlags();
  const mapped = await loadMatchingBaseRows();

  const experimental = mapped.filter((item) => item.study_group === 2);
  const control = mapped.filter((item) => item.study_group === 3);

  const candidatePairs = [];

  experimental.forEach((exp) => {
    control.forEach((ctrl) => {
      const candidate = computePairCandidate(exp, ctrl);
      if (!candidate) return;

      candidatePairs.push({
        experimental_user_id: exp.user_id,
        control_user_id: ctrl.user_id,
        age_diff: candidate.ageDiff,
        psqi_diff: candidate.psqiDiff,
        score: candidate.score,
      });
    });
  });

  candidatePairs.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.psqi_diff !== b.psqi_diff) return a.psqi_diff - b.psqi_diff;
    if (a.age_diff !== b.age_diff) return a.age_diff - b.age_diff;
    if (a.experimental_user_id !== b.experimental_user_id) {
      return a.experimental_user_id - b.experimental_user_id;
    }
    return a.control_user_id - b.control_user_id;
  });

  const expTaken = new Set();
  const ctrlTaken = new Set();
  const pairs = [];

  if (schemaFlags.hasMatchingPairsTable) {
    const confirmedRows = await query(
      `
        SELECT experimental_user_id, control_user_id, confirmed_at
        FROM admin_matching_pairs
        WHERE is_active = 1
        ORDER BY confirmed_at ASC, id ASC
      `
    );

    confirmedRows.forEach((item) => {
      const exp = findUserById(experimental, item.experimental_user_id);
      const ctrl = findUserById(control, item.control_user_id);
      if (!exp || !ctrl) return;

      const candidate = computePairCandidate(exp, ctrl);
      if (!candidate) return;
      if (expTaken.has(exp.user_id) || ctrlTaken.has(ctrl.user_id)) return;

      expTaken.add(exp.user_id);
      ctrlTaken.add(ctrl.user_id);
      pairs.push(buildPairResponse(exp, ctrl, candidate, { isConfirmed: true, confirmedAt: item.confirmed_at }));
    });
  }

  candidatePairs.forEach((candidate) => {
    if (expTaken.has(candidate.experimental_user_id) || ctrlTaken.has(candidate.control_user_id)) {
      return;
    }

    expTaken.add(candidate.experimental_user_id);
    ctrlTaken.add(candidate.control_user_id);

    const exp = experimental.find((item) => item.user_id === candidate.experimental_user_id);
    const ctrl = control.find((item) => item.user_id === candidate.control_user_id);
    if (!exp || !ctrl) return;

    pairs.push(
      buildPairResponse(exp, ctrl, {
        ageDiff: candidate.age_diff,
        psqiDiff: candidate.psqi_diff,
        score: candidate.score,
      })
    );
  });

  const unmatchedExperimental = experimental.filter((item) => !expTaken.has(item.user_id));
  const unmatchedControl = control.filter((item) => !ctrlTaken.has(item.user_id));

  const comparedPairs = pairs.filter((item) => item.outcome?.compared).length;
  const differentPairs = pairs.filter((item) => item.outcome?.different === true).length;
  const samePairs = pairs.filter((item) => item.outcome?.different === false).length;

  const outcomeSummary = OUTCOME_META.map((meta) => {
    const rows = pairs
      .map((pair) => pair.outcome?.rows?.find((item) => item.key === meta.key) || null)
      .filter(Boolean);

    const expChanges = rows.map((row) => row.experimental_change).filter((value) => value != null);
    const ctrlChanges = rows.map((row) => row.control_change).filter((value) => value != null);

    const avgExp =
      expChanges.length > 0
        ? Number((expChanges.reduce((sum, value) => sum + value, 0) / expChanges.length).toFixed(2))
        : null;
    const avgCtrl =
      ctrlChanges.length > 0
        ? Number((ctrlChanges.reduce((sum, value) => sum + value, 0) / ctrlChanges.length).toFixed(2))
        : null;

    return {
      key: meta.key,
      label: meta.label,
      experimental_avg_change: avgExp,
      control_avg_change: avgCtrl,
      difference: avgExp == null || avgCtrl == null ? null : Number((avgExp - avgCtrl).toFixed(2)),
    };
  });

  return ok(res, {
    summary: {
      experimental_total: experimental.length,
      control_total: control.length,
      matched_pairs: pairs.length,
      confirmed_pairs: pairs.filter((item) => item.is_confirmed).length,
      compared_pairs: comparedPairs,
      different_pairs: differentPairs,
      no_difference_pairs: samePairs,
      unmatched_experimental: unmatchedExperimental.length,
      unmatched_control: unmatchedControl.length,
      criteria: {
        gender: 'same',
        age_diff_max: 5,
        psqi_min_exclusive: 5,
        psqi_diff_max: 2,
      },
    },
    pairs,
    outcome_summary: outcomeSummary,
    unmatched: {
      experimental: unmatchedExperimental,
      control: unmatchedControl,
    },
  });
});

export const confirmAdminUserMatchingPair = asyncHandler(async (req, res) => {
  const schemaFlags = await loadSchemaFlags();
  if (!schemaFlags.hasMatchingPairsTable) {
    throw new AppError(500, 'SCHEMA_MISMATCH', 'admin_matching_pairs table is missing, please run migrations');
  }

  const experimentalUserId = Number(req.body?.experimental_user_id);
  const controlUserId = Number(req.body?.control_user_id);

  if (!Number.isInteger(experimentalUserId) || !Number.isInteger(controlUserId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'experimental_user_id and control_user_id are required integers');
  }

  const mapped = await loadMatchingBaseRows();
  const experimental = mapped.filter((item) => item.study_group === 2);
  const control = mapped.filter((item) => item.study_group === 3);

  const exp = findUserById(experimental, experimentalUserId);
  const ctrl = findUserById(control, controlUserId);

  if (!exp || !ctrl) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบผู้เข้าร่วมสำหรับการจับคู่');
  }

  const candidate = computePairCandidate(exp, ctrl);
  if (!candidate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'คู่นี้ไม่ผ่านเกณฑ์การจับคู่');
  }

  await query(
    `
      UPDATE admin_matching_pairs
      SET is_active = 0,
          cancelled_by_admin_id = ?,
          cancelled_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE is_active = 1
        AND (
          experimental_user_id = ?
          OR control_user_id = ?
        )
        AND NOT (
          experimental_user_id = ?
          AND control_user_id = ?
        )
    `,
    [req.auth?.id || null, experimentalUserId, controlUserId, experimentalUserId, controlUserId]
  );

  await query(
    `
      INSERT INTO admin_matching_pairs (
        experimental_user_id,
        control_user_id,
        is_active,
        confirmed_by_admin_id,
        confirmed_at,
        cancelled_by_admin_id,
        cancelled_at
      ) VALUES (?, ?, 1, ?, NOW(), NULL, NULL)
      ON DUPLICATE KEY UPDATE
        is_active = 1,
        confirmed_by_admin_id = VALUES(confirmed_by_admin_id),
        confirmed_at = VALUES(confirmed_at),
        cancelled_by_admin_id = NULL,
        cancelled_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `,
    [experimentalUserId, controlUserId, req.auth?.id || null]
  );

  return ok(res, {
    experimental_user_id: experimentalUserId,
    control_user_id: controlUserId,
    is_active: true,
  });
});

export const cancelAdminUserMatchingPair = asyncHandler(async (req, res) => {
  const schemaFlags = await loadSchemaFlags();
  if (!schemaFlags.hasMatchingPairsTable) {
    throw new AppError(500, 'SCHEMA_MISMATCH', 'admin_matching_pairs table is missing, please run migrations');
  }

  const experimentalUserId = Number(req.body?.experimental_user_id);
  const controlUserId = Number(req.body?.control_user_id);

  if (!Number.isInteger(experimentalUserId) || !Number.isInteger(controlUserId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'experimental_user_id and control_user_id are required integers');
  }

  const result = await query(
    `
      UPDATE admin_matching_pairs
      SET is_active = 0,
          cancelled_by_admin_id = ?,
          cancelled_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE experimental_user_id = ?
        AND control_user_id = ?
        AND is_active = 1
    `,
    [req.auth?.id || null, experimentalUserId, controlUserId]
  );

  if (!result?.affectedRows) {
    throw new AppError(404, 'NOT_FOUND', 'ไม่พบคู่ที่ยืนยันแล้วสำหรับยกเลิก');
  }

  return ok(res, {
    experimental_user_id: experimentalUserId,
    control_user_id: controlUserId,
    is_active: false,
  });
});
