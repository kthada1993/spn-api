import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';
import { validateAdminUserUpdateInput } from '../validators/admin-user-validator.js';

let schemaFlagsPromise;

async function loadSchemaFlags() {
  if (!schemaFlagsPromise) {
    schemaFlagsPromise = query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_screenings'
          AND COLUMN_NAME = 'study_group'
      `
    )
      .then((rows) => ({ hasStudyGroup: rows.length > 0 }))
      .catch((error) => {
        schemaFlagsPromise = null;
        throw error;
      });
  }

  return schemaFlagsPromise;
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
