import morgan from 'morgan';

import { logInfo } from '../config/logger.js';

export const requestLogger = morgan((tokens, req, res) => {
  const entry = {
    method: tokens.method(req, res),
    path: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    responseTimeMs: Number(tokens['response-time'](req, res)),
    contentLength: tokens.res(req, res, 'content-length') || '0'
  };

  logInfo('http_request', entry);
  return '';
});
