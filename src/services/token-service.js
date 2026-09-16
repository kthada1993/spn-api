import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

import { query } from '../database/connection.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function issueAuthTokens({ subjectId, role }) {
  const normalizedRole = role === 'ADMIN' ? 'ADMIN' : 'USER';
  const jti = uuidv4();

  const accessToken = signAccessToken({ sub: String(subjectId), role: normalizedRole, type: 'access' });
  const refreshToken = signRefreshToken({
    sub: String(subjectId),
    role: normalizedRole,
    type: 'refresh',
    jti
  });

  const payload = verifyRefreshToken(refreshToken);
  const expiresAt = new Date(payload.exp * 1000);

  await query(
    `
      INSERT INTO refresh_tokens (jti, subject_type, subject_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    [jti, normalizedRole, subjectId, sha256(refreshToken), expiresAt]
  );

  return { accessToken, refreshToken };
}

export async function validateRefreshToken(token) {
  let payload;

  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    // Invalid/expired/signature-mismatch refresh tokens should be treated as unauthenticated.
    return null;
  }

  const tokenHash = sha256(token);

  const rows = await query(
    `
      SELECT id, jti, subject_type, subject_id, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [tokenHash]
  );

  const record = rows[0];
  if (!record) {
    return null;
  }

  if (record.revoked_at) {
    return null;
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return {
    id: record.id,
    jti: record.jti,
    subjectType: record.subject_type,
    subjectId: record.subject_id,
    payload
  };
}

export async function revokeRefreshToken(token, replacedByJti = null) {
  const tokenHash = sha256(token);

  await query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(), replaced_by_jti = ?
      WHERE token_hash = ? AND revoked_at IS NULL
    `,
    [replacedByJti, tokenHash]
  );
}
