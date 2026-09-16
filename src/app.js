import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import v1Routes from './routes/v1/index.js';

function corsOptionsDelegate(req, callback) {
  const requestOrigin = req.header('Origin');

  if (!requestOrigin) {
    callback(null, { origin: true, credentials: true });
    return;
  }

  const allowed = env.CORS_ORIGINS.includes(requestOrigin);

  callback(null, {
    origin: allowed,
    credentials: true
  });
}

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors(corsOptionsDelegate));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.use(env.API_PREFIX, v1Routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
