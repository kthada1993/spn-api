export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function unauthorizedError() {
  return new AppError(401, 'UNAUTHORIZED', 'Authentication required');
}

export function forbiddenError() {
  return new AppError(403, 'FORBIDDEN', 'Access denied');
}

export function invalidCredentialsError() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
}
