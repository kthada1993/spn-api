import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { query } from '../database/connection.js';
import { AppError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const consentFilePath = path.resolve(__dirname, '../../../frontend/public/consent/consent.txt');

let cachedConsentText = null;

export async function getConsentDocument() {
  if (cachedConsentText == null) {
    const fileText = await fs.readFile(consentFilePath, 'utf8');
    cachedConsentText = String(fileText || '').trim();
  }

  return {
    version: 'v1',
    content: cachedConsentText,
  };
}

export async function getUserConsentStatus(userId) {
  const rows = await query(
    `
      SELECT screening_result, consent_accepted_at, consent_version
      FROM user_screenings
      WHERE user_id = ?
      LIMIT 1
    `,
    [userId]
  );

  const row = rows[0] || null;

  return {
    screening_passed: Number(row?.screening_result) === 1,
    consent_accepted: Boolean(row?.consent_accepted_at),
    consent_accepted_at: row?.consent_accepted_at || null,
    consent_version: row?.consent_version || null,
  };
}

export async function acceptUserConsent(userId) {
  const status = await getUserConsentStatus(userId);

  if (!status.screening_passed) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Screening must be passed before consent');
  }

  const doc = await getConsentDocument();

  await query(
    `
      UPDATE user_screenings
      SET consent_accepted_at = NOW(), consent_version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
      LIMIT 1
    `,
    [doc.version, userId]
  );

  return getUserConsentStatus(userId);
}
