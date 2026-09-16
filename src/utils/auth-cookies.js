import { env } from '../config/env.js';

const ROLE_ADMIN = 'ADMIN';
const ROLE_USER = 'USER';

export function normalizeRole(value) {
  const role = String(value || '').toUpperCase();
  return role === ROLE_ADMIN || role === ROLE_USER ? role : null;
}

export function resolveRequestRole(req) {
  const queryRole = normalizeRole(req?.query?.role);
  if (queryRole) return queryRole;

  const path = String(req?.path || '').toLowerCase();
  const baseUrl = String(req?.baseUrl || '').toLowerCase();
  const originalUrl = String(req?.originalUrl || '').toLowerCase();
  const routeHint = `${baseUrl} ${path} ${originalUrl}`;

  if (routeHint.includes('/me/admin') || routeHint.includes('/logout/admin')) return ROLE_ADMIN;
  if (routeHint.includes('/me/user') || routeHint.includes('/logout/user')) return ROLE_USER;
  if (routeHint.includes('/admin/')) return ROLE_ADMIN;
  if (routeHint.endsWith('/admin')) return ROLE_ADMIN;
  if (routeHint.includes('/user/')) return ROLE_USER;
  if (routeHint.endsWith('/user')) return ROLE_USER;

  return null;
}

export function getRoleCookieNames(role) {
  const normalizedRole = normalizeRole(role) || ROLE_USER;

  if (normalizedRole === ROLE_ADMIN) {
    return {
      access: env.ADMIN_ACCESS_COOKIE_NAME,
      refresh: env.ADMIN_REFRESH_COOKIE_NAME,
    };
  }

  return {
    access: env.USER_ACCESS_COOKIE_NAME,
    refresh: env.USER_REFRESH_COOKIE_NAME,
  };
}

export function getLegacyCookieNames() {
  return {
    access: env.ACCESS_COOKIE_NAME,
    refresh: env.REFRESH_COOKIE_NAME,
  };
}
