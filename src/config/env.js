import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: envPath });

const requiredInProduction = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];

if (process.env.NODE_ENV === 'production') {
  for (const key of requiredInProduction) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOrigins(raw) {
  if (!raw) {
    return ['http://localhost:3030', 'http://localhost:5173'];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: toNumber(process.env.PORT, 3000),
  HOST: process.env.HOST ?? '0.0.0.0',
  API_PREFIX: process.env.API_PREFIX ?? '/api/v1',
  CORS_ORIGINS: parseOrigins(process.env.CORS_ORIGIN),
  DB_HOST: process.env.DB_HOST ?? 'localhost',
  DB_PORT: toNumber(process.env.DB_PORT, 3306),
  DB_NAME: process.env.DB_NAME ?? 'assessment',
  DB_USER: process.env.DB_USER ?? 'root',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_CONNECTION_LIMIT: toNumber(process.env.DB_CONNECTION_LIMIT, 10),
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
  JWT_ISSUER: process.env.JWT_ISSUER ?? 'assessment-api',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE ?? 'assessment-web',
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN ?? '15m',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN ?? '7d',
  ADMIN_ACCESS_COOKIE_NAME: process.env.ADMIN_ACCESS_COOKIE_NAME ?? 'admin_access_token',
  ADMIN_REFRESH_COOKIE_NAME: process.env.ADMIN_REFRESH_COOKIE_NAME ?? 'admin_refresh_token',
  USER_ACCESS_COOKIE_NAME: process.env.USER_ACCESS_COOKIE_NAME ?? 'user_access_token',
  USER_REFRESH_COOKIE_NAME: process.env.USER_REFRESH_COOKIE_NAME ?? 'user_refresh_token',
  ACCESS_COOKIE_NAME: process.env.ACCESS_COOKIE_NAME ?? 'access_token',
  REFRESH_COOKIE_NAME: process.env.REFRESH_COOKIE_NAME ?? 'refresh_token',
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID ?? '',
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET ?? '',
  LINE_CALLBACK_URL: process.env.LINE_CALLBACK_URL ?? '',
  FRONTEND_USER_DASHBOARD_URL: process.env.FRONTEND_USER_DASHBOARD_URL ?? 'http://localhost:3030/user/dashboard',
  FRONTEND_USER_LOGIN_URL: process.env.FRONTEND_USER_LOGIN_URL ?? 'http://localhost:3030/user/login',
  CONSENT_FILE_PATH: process.env.CONSENT_FILE_PATH ?? '',
  DEFAULT_ADMIN_USERNAME: process.env.DEFAULT_ADMIN_USERNAME ?? 'admin',
  DEFAULT_ADMIN_PASSWORD: process.env.DEFAULT_ADMIN_PASSWORD ?? '',
  MONITORING_ROUND2_WAIT_DAYS: toNumber(process.env.MONITORING_ROUND2_WAIT_DAYS, 49),
  MONITORING_PSQI_HIGH_THRESHOLD: toNumber(process.env.MONITORING_PSQI_HIGH_THRESHOLD, 10),
  MONITORING_DIARY_SE_THRESHOLD: toNumber(process.env.MONITORING_DIARY_SE_THRESHOLD, 80),
  MONITORING_DIARY_MISSING_DAYS_THRESHOLD: toNumber(process.env.MONITORING_DIARY_MISSING_DAYS_THRESHOLD, 3),
};

export const isProduction = env.NODE_ENV === 'production';
