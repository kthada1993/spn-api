import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

function normalizeName(value) {
  return String(value || '').trim();
}

function parseId(value, label) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `Invalid ${label} id`);
  }
  return id;
}

function mapDuplicateError(error, label) {
  if (error?.code === 'ER_DUP_ENTRY') {
    throw new AppError(409, 'DUPLICATE_RESOURCE', `${label} already exists`);
  }
  throw error;
}

export async function listHospitals({ includeInactive = false } = {}) {
  const rows = await query(
    `
      SELECT id, name, is_active, created_at, updated_at
      FROM master_hospitals
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY id ASC
    `
  );

  return rows;
}

export async function listDepartments({ includeInactive = false } = {}) {
  const rows = await query(
    `
      SELECT id, name, is_active, created_at, updated_at
      FROM master_departments
      ${includeInactive ? '' : 'WHERE is_active = 1'}
      ORDER BY id ASC
    `
  );

  return rows;
}

export async function createHospital(input) {
  const name = normalizeName(input.name);

  try {
    const result = await query('INSERT INTO master_hospitals (name, is_active) VALUES (?, 1)', [name]);
    const rows = await query('SELECT id, name, is_active, created_at, updated_at FROM master_hospitals WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0] || null;
  } catch (error) {
    mapDuplicateError(error, 'Hospital');
  }
}

export async function updateHospital(idInput, input) {
  const id = parseId(idInput, 'hospital');
  const name = normalizeName(input.name);

  const exists = await query('SELECT id FROM master_hospitals WHERE id = ? LIMIT 1', [id]);
  if (!exists[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Hospital not found');
  }

  try {
    await query('UPDATE master_hospitals SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, id]);
  } catch (error) {
    mapDuplicateError(error, 'Hospital');
  }

  const rows = await query('SELECT id, name, is_active, created_at, updated_at FROM master_hospitals WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

export async function deleteHospital(idInput) {
  const id = parseId(idInput, 'hospital');

  const exists = await query('SELECT id FROM master_hospitals WHERE id = ? LIMIT 1', [id]);
  if (!exists[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Hospital not found');
  }

  const usageRows = await query('SELECT COUNT(1) AS total FROM user_screenings WHERE hospital_id = ?', [id]);
  if (Number(usageRows[0]?.total || 0) > 0) {
    throw new AppError(409, 'RESOURCE_IN_USE', 'Hospital is in use and cannot be deleted');
  }

  await query('DELETE FROM master_hospitals WHERE id = ?', [id]);
}

export async function createDepartment(input) {
  const name = normalizeName(input.name);

  try {
    const result = await query('INSERT INTO master_departments (name, is_active) VALUES (?, 1)', [name]);
    const rows = await query('SELECT id, name, is_active, created_at, updated_at FROM master_departments WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0] || null;
  } catch (error) {
    mapDuplicateError(error, 'Department');
  }
}

export async function updateDepartment(idInput, input) {
  const id = parseId(idInput, 'department');
  const name = normalizeName(input.name);

  const exists = await query('SELECT id FROM master_departments WHERE id = ? LIMIT 1', [id]);
  if (!exists[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Department not found');
  }

  try {
    await query('UPDATE master_departments SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, id]);
  } catch (error) {
    mapDuplicateError(error, 'Department');
  }

  const rows = await query('SELECT id, name, is_active, created_at, updated_at FROM master_departments WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

export async function deleteDepartment(idInput) {
  const id = parseId(idInput, 'department');

  const exists = await query('SELECT id FROM master_departments WHERE id = ? LIMIT 1', [id]);
  if (!exists[0]) {
    throw new AppError(404, 'NOT_FOUND', 'Department not found');
  }

  const usageRows = await query('SELECT COUNT(1) AS total FROM user_screenings WHERE department_id = ?', [id]);
  if (Number(usageRows[0]?.total || 0) > 0) {
    throw new AppError(409, 'RESOURCE_IN_USE', 'Department is in use and cannot be deleted');
  }

  await query('DELETE FROM master_departments WHERE id = ?', [id]);
}

export async function ensureHospitalExists(hospitalId) {
  const rows = await query(
    'SELECT id FROM master_hospitals WHERE id = ? AND is_active = 1 LIMIT 1',
    [hospitalId]
  );

  if (!rows[0]) {
    throw new AppError(400, 'VALIDATION_ERROR', 'hospital_id: Invalid hospital');
  }
}

export async function ensureDepartmentExists(departmentId) {
  const rows = await query(
    'SELECT id FROM master_departments WHERE id = ? AND is_active = 1 LIMIT 1',
    [departmentId]
  );

  if (!rows[0]) {
    throw new AppError(400, 'VALIDATION_ERROR', 'department_id: Invalid department');
  }
}

export async function getScreeningOptions() {
  const [hospitals, departments] = await Promise.all([
    listHospitals({ includeInactive: false }),
    listDepartments({ includeInactive: false }),
  ]);

  return {
    hospitals: hospitals.map((item) => ({ value: item.id, label: item.name })),
    departments: departments.map((item) => ({ value: item.id, label: item.name })),
  };
}
