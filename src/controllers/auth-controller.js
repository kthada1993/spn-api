import crypto from 'node:crypto';

import rateLimit from 'express-rate-limit';

import { env, isProduction } from '../config/env.js';
import { ok } from '../utils/api-response.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError, unauthorizedError } from '../utils/errors.js';
import { validateAdminLogin } from '../validators/auth-validator.js';
import { authenticateAdmin, findOrCreateUserByLineProfile } from '../services/auth-service.js';
import { issueAuthTokens, revokeRefreshToken } from '../services/token-service.js';
import {
  normalizeRole,
  resolveRequestRole,
  getRoleCookieNames,
  getLegacyCookieNames,
} from '../utils/auth-cookies.js';
import {
  buildLineAuthorizeUrl,
  exchangeLineCode,
  verifyLineIdToken
} from '../services/line-oauth-service.js';

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

function authCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs
  };
}

function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  };
}

function setAuthCookies(res, tokens, role) {
  const names = getRoleCookieNames(role);
  res.cookie(names.access, tokens.accessToken, authCookieOptions(accessMaxAgeMs));
  res.cookie(names.refresh, tokens.refreshToken, authCookieOptions(refreshMaxAgeMs));
}

function clearRoleAuthCookies(res, role) {
  const names = getRoleCookieNames(role);
  res.clearCookie(names.access, clearCookieOptions());
  res.clearCookie(names.refresh, clearCookieOptions());
}

function clearLegacyAuthCookies(res) {
  const names = getLegacyCookieNames();
  res.clearCookie(names.access, clearCookieOptions());
  res.clearCookie(names.refresh, clearCookieOptions());
}

function clearOAuthTempCookies(res) {
  res.clearCookie('line_oauth_state', clearCookieOptions());
  res.clearCookie('line_oauth_nonce', clearCookieOptions());
  res.clearCookie('line_return_to', clearCookieOptions());
}

export const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts, please try again later'
    }
  }
});

export const adminLogin = asyncHandler(async (req, res) => {
  const input = validateAdminLogin(req.body);
  const admin = await authenticateAdmin(input.username, input.password);

  const tokens = await issueAuthTokens({
    subjectId: admin.id,
    role: 'ADMIN'
  });

  setAuthCookies(res, tokens, 'ADMIN');

  return ok(res, {
    id: admin.id,
    role: admin.role,
    display_name: admin.displayName,
    username: admin.username
  });
});

export const lineAuthorize = asyncHandler(async (req, res) => {
  const state = crypto.randomBytes(24).toString('hex');
  const nonce = crypto.randomBytes(24).toString('hex');
  const dashboardPath = new URL(env.FRONTEND_USER_DASHBOARD_URL).pathname;
  const returnTo =
    typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/')
      ? req.query.returnTo
      : dashboardPath;

  res.cookie('line_oauth_state', state, authCookieOptions(10 * 60 * 1000));
  res.cookie('line_oauth_nonce', nonce, authCookieOptions(10 * 60 * 1000));
  res.cookie('line_return_to', returnTo, authCookieOptions(10 * 60 * 1000));

  const lineUrl = buildLineAuthorizeUrl(state, nonce);
  return res.redirect(lineUrl);
});

export const lineCallback = asyncHandler(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    throw new AppError(400, 'INVALID_LINE_CALLBACK', 'Invalid LINE callback payload');
  }

  const expectedState = req.cookies.line_oauth_state;
  const expectedNonce = req.cookies.line_oauth_nonce;
  const dashboardPath = new URL(env.FRONTEND_USER_DASHBOARD_URL).pathname;
  const requestedReturnTo = req.cookies.line_return_to || dashboardPath;

  if (!expectedState || state !== expectedState) {
    throw new AppError(400, 'INVALID_LINE_STATE', 'Invalid OAuth state');
  }

  const tokenData = await exchangeLineCode(String(code));
  if (!tokenData.id_token) {
    throw new AppError(401, 'LINE_AUTH_FAILED', 'LINE authentication failed');
  }

  const profile = await verifyLineIdToken(tokenData.id_token, expectedNonce);
  const user = await findOrCreateUserByLineProfile(profile);

  const tokens = await issueAuthTokens({ subjectId: user.id, role: 'USER' });
  setAuthCookies(res, tokens, 'USER');

  clearOAuthTempCookies(res);

  const frontendDashboardUrl = new URL(env.FRONTEND_USER_DASHBOARD_URL);
  const frontendOrigin = `${frontendDashboardUrl.protocol}//${frontendDashboardUrl.host}`;
  const allowedReturnPaths = new Set([dashboardPath]);
  const safeReturnPath = allowedReturnPaths.has(requestedReturnTo)
    ? requestedReturnTo
    : dashboardPath;
  const redirectTarget = new URL(safeReturnPath, frontendOrigin).toString();

  return res.redirect(redirectTarget);
});

export const me = asyncHandler(async (req, res) => {
  if (!req.auth) {
    throw unauthorizedError();
  }

  const payload = {
    id: req.auth.id,
    role: req.auth.role,
    display_name: req.auth.displayName
  };

  if (req.auth.role === 'ADMIN') {
    payload.username = req.auth.username;
  }

  if (req.auth.role === 'USER') {
    payload.code_id = req.auth.codeId;
    payload.picture_url = req.auth.pictureUrl;
    payload.email = req.auth.email;
    payload.line_user_id = req.auth.lineUserId;
    payload.approval_status = req.auth.approvalStatus;
    payload.study_group = req.auth.studyGroup;
    payload.profile_completed = req.auth.profileCompleted;
    payload.screening_passed = req.auth.screeningPassed;
    payload.consent_accepted = req.auth.consentAccepted;
    payload.psqi_round1_score = req.auth.psqiRound1Score;
    payload.psqi_round1_total_score = req.auth.psqiRound1TotalScore;
    payload.psqi_passed = req.auth.psqiPassed;
  }

  return ok(res, payload);
});

export const logout = asyncHandler(async (req, res) => {
  const requestedRole = resolveRequestRole(req);
  const role = requestedRole || normalizeRole(req.auth?.role) || 'USER';
  const roleCookies = getRoleCookieNames(role);
  const legacyCookies = getLegacyCookieNames();

  const refreshToken = req.cookies[roleCookies.refresh] || req.cookies[legacyCookies.refresh];
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
  }

  clearRoleAuthCookies(res, role);
  clearLegacyAuthCookies(res);
  clearOAuthTempCookies(res);

  return ok(res, null, 'Logged out');
});
