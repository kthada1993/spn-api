import axios from 'axios';

import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const LINE_AUTH_URL = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN_URL = 'https://api.line.me/oauth2/v2.1/token';
const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

export function ensureLineConfigured() {
  if (!env.LINE_CHANNEL_ID || !env.LINE_CHANNEL_SECRET || !env.LINE_CALLBACK_URL) {
    throw new AppError(500, 'LINE_NOT_CONFIGURED', 'LINE Login is not configured');
  }

  if (!/^\d+$/.test(env.LINE_CHANNEL_ID)) {
    throw new AppError(
      500,
      'LINE_INVALID_CHANNEL_ID',
      'LINE_CHANNEL_ID must be a numeric LINE Login channel ID from LINE Developers console'
    );
  }
}

export function buildLineAuthorizeUrl(state, nonce) {
  ensureLineConfigured();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINE_CHANNEL_ID,
    redirect_uri: env.LINE_CALLBACK_URL,
    state,
    scope: 'openid profile email',
    nonce
  });

  return `${LINE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeLineCode(code) {
  ensureLineConfigured();

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.LINE_CALLBACK_URL,
    client_id: env.LINE_CHANNEL_ID,
    client_secret: env.LINE_CHANNEL_SECRET
  });

  const response = await axios.post(LINE_TOKEN_URL, form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 10000
  });

  return response.data;
}

export async function verifyLineIdToken(idToken, nonce) {
  ensureLineConfigured();

  const form = new URLSearchParams({
    id_token: idToken,
    client_id: env.LINE_CHANNEL_ID,
    nonce
  });

  const response = await axios.post(LINE_VERIFY_URL, form.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 10000
  });

  return response.data;
}
