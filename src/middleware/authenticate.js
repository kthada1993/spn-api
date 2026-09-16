import { env, isProduction } from '../config/env.js';
import { findPrincipalByRoleAndId } from '../services/auth-service.js';
import { issueAuthTokens, validateRefreshToken, revokeRefreshToken } from '../services/token-service.js';
import {
  normalizeRole,
  resolveRequestRole,
  getRoleCookieNames,
  getLegacyCookieNames,
} from '../utils/auth-cookies.js';
import { unauthorizedError } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/jwt.js';

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs
  };
}

function parseTokenExpiryMs(value, fallbackMs) {
  const match = /^([0-9]+)([smhd])$/.exec(value || '');
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2];

  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return amount * multipliers[unit];
}

const accessMaxAgeMs = parseTokenExpiryMs(env.ACCESS_TOKEN_EXPIRES_IN, 15 * 60 * 1000);
const refreshMaxAgeMs = parseTokenExpiryMs(env.REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

function getTokenFromCookies(cookies, names = []) {
  for (const name of names) {
    if (cookies?.[name]) {
      return {
        name,
        token: cookies[name],
      };
    }
  }

  return null;
}

function roleSearchOrder(requestRole) {
  if (requestRole) {
    return [requestRole];
  }

  return ['USER', 'ADMIN'];
}

export async function authenticate(req, res, next) {
  const requestRole = resolveRequestRole(req);
  const legacy = getLegacyCookieNames();

  for (const role of roleSearchOrder(requestRole)) {
    const names = getRoleCookieNames(role);
    const accessCandidate = getTokenFromCookies(req.cookies, [names.access, legacy.access]);

    if (!accessCandidate) {
      continue;
    }

    try {
      const payload = verifyAccessToken(accessCandidate.token);
      if (normalizeRole(payload.role) !== role) {
        continue;
      }

      const principal = await findPrincipalByRoleAndId(payload.role, Number(payload.sub));
      if (!principal) {
        return next(unauthorizedError());
      }

      req.auth = principal;
      return next();
    } catch (error) {
      // Ignore and attempt refresh-based re-authentication.
    }
  }

  for (const role of roleSearchOrder(requestRole)) {
    const names = getRoleCookieNames(role);
    const refreshCandidate = getTokenFromCookies(req.cookies, [names.refresh, legacy.refresh]);

    if (!refreshCandidate) {
      continue;
    }

    const refreshRecord = await validateRefreshToken(refreshCandidate.token);
    if (!refreshRecord) {
      continue;
    }

    if (normalizeRole(refreshRecord.payload.role) !== role) {
      continue;
    }

    const principal = await findPrincipalByRoleAndId(
      refreshRecord.payload.role,
      Number(refreshRecord.payload.sub)
    );

    if (!principal) {
      return next(unauthorizedError());
    }

    await revokeRefreshToken(refreshCandidate.token);
    const rotated = await issueAuthTokens({ subjectId: principal.id, role: principal.role });

    const principalCookieNames = getRoleCookieNames(principal.role);
    res.cookie(principalCookieNames.access, rotated.accessToken, cookieOptions(accessMaxAgeMs));
    res.cookie(principalCookieNames.refresh, rotated.refreshToken, cookieOptions(refreshMaxAgeMs));

    req.auth = principal;
    return next();
  }

  return next(unauthorizedError());
}
