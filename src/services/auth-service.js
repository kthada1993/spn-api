import bcrypt from 'bcryptjs';

import { query } from '../database/connection.js';
import { invalidCredentialsError, unauthorizedError } from '../utils/errors.js';

let schemaFlagsPromise;

async function loadSchemaFlags() {
  if (!schemaFlagsPromise) {
    schemaFlagsPromise = query(
      `
        SELECT TABLE_NAME, COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND (
            (TABLE_NAME = 'users' AND COLUMN_NAME IN ('approval_status'))
            OR
            (TABLE_NAME = 'user_screenings' AND COLUMN_NAME IN ('first_name', 'last_name', 'screening_result', 'consent_accepted_at', 'study_group'))
          )
      `
    )
      .then((rows) => {
        const hasApprovalStatus = rows.some(
          (row) => row.TABLE_NAME === 'users' && row.COLUMN_NAME === 'approval_status'
        );

        const hasFirstName = rows.some(
          (row) => row.TABLE_NAME === 'user_screenings' && row.COLUMN_NAME === 'first_name'
        );

        const hasLastName = rows.some(
          (row) => row.TABLE_NAME === 'user_screenings' && row.COLUMN_NAME === 'last_name'
        );

        const hasScreeningResult = rows.some(
          (row) => row.TABLE_NAME === 'user_screenings' && row.COLUMN_NAME === 'screening_result'
        );

        const hasConsentAcceptedAt = rows.some(
          (row) => row.TABLE_NAME === 'user_screenings' && row.COLUMN_NAME === 'consent_accepted_at'
        );

        const hasStudyGroup = rows.some(
          (row) => row.TABLE_NAME === 'user_screenings' && row.COLUMN_NAME === 'study_group'
        );

        return {
          hasApprovalStatus,
          hasNameParts: hasFirstName && hasLastName,
          hasScreeningResult,
          hasConsentAcceptedAt,
          hasStudyGroup,
        };
      })
      .catch((error) => {
        schemaFlagsPromise = null;
        throw error;
      });
  }

  return schemaFlagsPromise;
}

function buildUserCodeId(id) {
  return `SPN-${String(id).padStart(3, '0')}`;
}

export async function authenticateAdmin(username, password) {
  const rows = await query(
    `
      SELECT id, username, password_hash, name, status
      FROM admins
      WHERE username = ?
      LIMIT 1
    `,
    [username]
  );

  const admin = rows[0];

  if (!admin || admin.status !== 'ACTIVE') {
    throw invalidCredentialsError();
  }

  const passwordOk = await bcrypt.compare(password, admin.password_hash);

  if (!passwordOk) {
    throw invalidCredentialsError();
  }

  await query('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [admin.id]);

  return {
    id: admin.id,
    role: 'ADMIN',
    username: admin.username,
    displayName: admin.name
  };
}

export async function findOrCreateUserByLineProfile(profile) {
  const schemaFlags = await loadSchemaFlags();

  const rows = await query(
    `
      SELECT
        id,
        code_id,
        line_user_id,
        display_name,
        picture_url,
        email,
        status,
        ${schemaFlags.hasApprovalStatus ? 'approval_status' : "'PENDING' AS approval_status"}
      FROM users
      WHERE line_user_id = ?
      LIMIT 1
    `,
    [profile.sub]
  );

  const existing = rows[0];

  if (existing && existing.status !== 'ACTIVE') {
    throw unauthorizedError();
  }

  if (existing) {
    const codeId = existing.code_id || buildUserCodeId(existing.id);

    await query(
      'UPDATE users SET last_login_at = NOW(), display_name = ?, picture_url = ?, email = ?, code_id = COALESCE(code_id, ?) WHERE id = ?',
      [profile.name, profile.picture || null, profile.email || null, codeId, existing.id]
    );

    return {
      id: existing.id,
      codeId,
      role: 'USER',
      lineUserId: existing.line_user_id,
      displayName: profile.name,
      pictureUrl: profile.picture || null,
      email: profile.email || null
    };
  }

  const result = await query(
    `
      INSERT INTO users (line_user_id, display_name, picture_url, email, status, last_login_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', NOW())
    `,
    [profile.sub, profile.name, profile.picture || null, profile.email || null]
  );

  const codeId = buildUserCodeId(result.insertId);

  await query('UPDATE users SET code_id = ? WHERE id = ?', [codeId, result.insertId]);

  return {
    id: result.insertId,
    codeId,
    role: 'USER',
    lineUserId: profile.sub,
    displayName: profile.name,
    pictureUrl: profile.picture || null,
    email: profile.email || null
  };
}

export async function findPrincipalByRoleAndId(role, id) {
  if (role === 'ADMIN') {
    const rows = await query(
      'SELECT id, username, name, status FROM admins WHERE id = ? LIMIT 1',
      [id]
    );
    const admin = rows[0];
    if (!admin || admin.status !== 'ACTIVE') return null;

    return {
      id: admin.id,
      role: 'ADMIN',
      username: admin.username,
      displayName: admin.name
    };
  }

  const schemaFlags = await loadSchemaFlags();

  const rows = await query(
    `
      SELECT
        u.id,
        u.code_id,
        u.line_user_id,
        u.display_name,
        u.picture_url,
        u.email,
        u.status,
        ${schemaFlags.hasApprovalStatus ? 'u.approval_status' : "'PENDING' AS approval_status"},
        s.full_name,
        ${schemaFlags.hasNameParts ? 's.first_name' : 'NULL AS first_name'},
        ${schemaFlags.hasNameParts ? 's.last_name' : 'NULL AS last_name'},
        s.hospital_id,
        ${schemaFlags.hasStudyGroup ? 's.study_group' : 'NULL AS study_group'},
        ${schemaFlags.hasScreeningResult ? 's.screening_result' : '0 AS screening_result'},
        ${schemaFlags.hasConsentAcceptedAt ? 's.consent_accepted_at' : 'NULL AS consent_accepted_at'},
        (
          SELECT ua.total_score
          FROM user_assessments ua
          WHERE ua.user_id = u.id AND ua.assessment_round = 1
          ORDER BY ua.id DESC
          LIMIT 1
        ) AS psqi_round1_total_score
      FROM users u
      LEFT JOIN user_screenings s ON s.user_id = u.id
      WHERE u.id = ?
      LIMIT 1
    `,
    [id]
  );
  const user = rows[0];
  if (!user || user.status !== 'ACTIVE') return null;

  const psqiRound1TotalScore =
    user.psqi_round1_total_score == null || Number.isNaN(Number(user.psqi_round1_total_score))
      ? null
      : Number(user.psqi_round1_total_score);

  return {
    id: user.id,
    codeId: user.code_id,
    role: 'USER',
    lineUserId: user.line_user_id,
    displayName: user.display_name,
    pictureUrl: user.picture_url,
    email: user.email,
    approvalStatus: user.approval_status || 'PENDING',
    studyGroup:
      user.study_group == null || Number.isNaN(Number(user.study_group))
        ? null
        : Number(user.study_group),
    profileCompleted: Boolean((user.full_name || (user.first_name && user.last_name)) && user.hospital_id),
    screeningPassed: Number(user.screening_result) === 1,
    consentAccepted: Boolean(user.consent_accepted_at),
    psqiRound1Score: psqiRound1TotalScore,
    psqiRound1TotalScore,
    psqiPassed: psqiRound1TotalScore == null ? null : psqiRound1TotalScore > 5,
  };
}
