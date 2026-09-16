import { query } from '../database/connection.js';
import { ensureHospitalExists, ensureDepartmentExists } from './master-data-service.js';

let profileNameColumnsPromise;

async function loadProfileNameColumns() {
  if (!profileNameColumnsPromise) {
    profileNameColumnsPromise = query(
      `
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'user_screenings'
          AND COLUMN_NAME IN ('name_prefix', 'first_name', 'last_name', 'study_group')
      `
    )
      .then((rows) => {
        const columnSet = new Set(rows.map((row) => row.COLUMN_NAME));
        return {
          hasNamePrefix: columnSet.has('name_prefix'),
          hasFirstName: columnSet.has('first_name'),
          hasLastName: columnSet.has('last_name'),
          hasStudyGroup: columnSet.has('study_group'),
          hasAllNameParts:
            columnSet.has('name_prefix') && columnSet.has('first_name') && columnSet.has('last_name'),
        };
      })
      .catch((error) => {
        profileNameColumnsPromise = null;
        throw error;
      });
  }

  return profileNameColumnsPromise;
}

function buildResults(payload) {
  const inclusionResult =
    payload.inclusion_1 === 1 &&
    payload.inclusion_2 === 1 &&
    payload.inclusion_3 === 1 &&
    payload.inclusion_4 === 1
      ? 1
      : 0;

  const exclusionResult =
    payload.exclusion_1 === 0 &&
    payload.exclusion_2 === 0 &&
    payload.exclusion_3 === 0 &&
    payload.exclusion_4 === 0
      ? 1
      : 0;

  const screeningResult = inclusionResult === 1 && exclusionResult === 1 ? 1 : 0;

  return {
    inclusion_result: inclusionResult,
    exclusion_1: payload.exclusion_1,
    exclusion_2: payload.exclusion_2,
    exclusion_3: payload.exclusion_3,
    exclusion_4: payload.exclusion_4,
    exclusion_result: exclusionResult,
    screening_result: screeningResult
  };
}

export async function getUserScreeningByUserId(userId) {
  const profileNameColumns = await loadProfileNameColumns();

  const rows = await query(
    `
      SELECT
        id,
        user_id,
        full_name,
        ${profileNameColumns.hasNamePrefix ? 'name_prefix' : 'NULL AS name_prefix'},
        ${profileNameColumns.hasFirstName ? 'first_name' : 'NULL AS first_name'},
        ${profileNameColumns.hasLastName ? 'last_name' : 'NULL AS last_name'},
        age,
        gender,
        marital_status,
        has_children,
        education,
        education_other,
        hospital_id,
        department_id,
        ${profileNameColumns.hasStudyGroup ? 'study_group' : 'NULL AS study_group'},
        current_position_years,
        shift_work_years,
        night_shift_per_month,
        working_hours_per_week,
        weight_kg,
        height_cm,
        has_underlying_disease,
        underlying_disease_detail,
        phone,
        line_id,
        inclusion_1,
        inclusion_2,
        inclusion_3,
        inclusion_4,
        inclusion_result,
        exclusion_1,
        exclusion_2,
        exclusion_3,
        exclusion_4,
        exclusion_result,
        screening_result,
        created_at,
        updated_at
      FROM user_screenings
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
}

export async function upsertUserProfileBasics(userId, payload) {
  const profileNameColumns = await loadProfileNameColumns();
  const departmentId = payload.department_id ?? null;

  await ensureHospitalExists(payload.hospital_id);
  if (departmentId != null) {
    await ensureDepartmentExists(departmentId);
  }

  if (profileNameColumns.hasAllNameParts) {
    await query(
      `
        INSERT INTO user_screenings (
          user_id,
          full_name,
          name_prefix,
          first_name,
          last_name,
          hospital_id,
          department_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          name_prefix = VALUES(name_prefix),
          first_name = VALUES(first_name),
          last_name = VALUES(last_name),
          hospital_id = VALUES(hospital_id),
          department_id = COALESCE(department_id, VALUES(department_id)),
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        userId,
        payload.full_name,
        payload.name_prefix,
        payload.first_name,
        payload.last_name,
        payload.hospital_id,
        departmentId,
      ]
    );
  } else {
    await query(
      `
        INSERT INTO user_screenings (user_id, full_name, hospital_id, department_id)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          hospital_id = VALUES(hospital_id),
          department_id = COALESCE(department_id, VALUES(department_id)),
          updated_at = CURRENT_TIMESTAMP
      `,
      [userId, payload.full_name, payload.hospital_id, departmentId]
    );
  }

  return getUserScreeningByUserId(userId);
}

export async function upsertUserScreening(userId, payload) {
  const results = buildResults(payload);

  await ensureHospitalExists(payload.hospital_id);
  await ensureDepartmentExists(payload.department_id);

  await query(
    `
      INSERT INTO user_screenings (
        user_id,
        full_name,
        age,
        gender,
        marital_status,
        has_children,
        education,
        education_other,
        hospital_id,
        department_id,
        current_position_years,
        shift_work_years,
        night_shift_per_month,
        working_hours_per_week,
        weight_kg,
        height_cm,
        has_underlying_disease,
        underlying_disease_detail,
        phone,
        line_id,
        inclusion_1,
        inclusion_2,
        inclusion_3,
        inclusion_4,
        inclusion_result,
        exclusion_1,
        exclusion_2,
        exclusion_3,
        exclusion_4,
        exclusion_result,
        screening_result
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        age = VALUES(age),
        gender = VALUES(gender),
        marital_status = VALUES(marital_status),
        has_children = VALUES(has_children),
        education = VALUES(education),
        education_other = VALUES(education_other),
        hospital_id = VALUES(hospital_id),
        department_id = VALUES(department_id),
        current_position_years = VALUES(current_position_years),
        shift_work_years = VALUES(shift_work_years),
        night_shift_per_month = VALUES(night_shift_per_month),
        working_hours_per_week = VALUES(working_hours_per_week),
        weight_kg = VALUES(weight_kg),
        height_cm = VALUES(height_cm),
        has_underlying_disease = VALUES(has_underlying_disease),
        underlying_disease_detail = VALUES(underlying_disease_detail),
        phone = VALUES(phone),
        line_id = VALUES(line_id),
        inclusion_1 = VALUES(inclusion_1),
        inclusion_2 = VALUES(inclusion_2),
        inclusion_3 = VALUES(inclusion_3),
        inclusion_4 = VALUES(inclusion_4),
        inclusion_result = VALUES(inclusion_result),
        exclusion_1 = VALUES(exclusion_1),
        exclusion_2 = VALUES(exclusion_2),
        exclusion_3 = VALUES(exclusion_3),
        exclusion_4 = VALUES(exclusion_4),
        exclusion_result = VALUES(exclusion_result),
        screening_result = VALUES(screening_result),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      userId,
      payload.full_name,
      payload.age,
      payload.gender,
      payload.marital_status,
      payload.has_children,
      payload.education,
      payload.education_other,
      payload.hospital_id,
      payload.department_id,
      payload.current_position_years,
      payload.shift_work_years,
      payload.night_shift_per_month,
      payload.working_hours_per_week,
      payload.weight_kg,
      payload.height_cm,
      payload.has_underlying_disease,
      payload.underlying_disease_detail,
      payload.phone,
      payload.line_id,
      payload.inclusion_1,
      payload.inclusion_2,
      payload.inclusion_3,
      payload.inclusion_4,
      results.inclusion_result,
      results.exclusion_1,
      results.exclusion_2,
      results.exclusion_3,
      results.exclusion_4,
      results.exclusion_result,
      results.screening_result
    ]
  );

  return getUserScreeningByUserId(userId);
}
