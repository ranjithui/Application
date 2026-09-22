import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { api } from './routes/index.js';
import { docsRouter } from './routes/docs.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter, noStore, sanitizeBody } from './middleware/security.js';
import { logger } from './utils/logger.js';
import { pool } from './config/db.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind one reverse proxy in production (nginx / load balancer)
  app.set('trust proxy', env.isProd ? 1 : false);

  app.use(pinoHttp({
    logger,
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === '/api/health' },
  }));

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Swagger UI needs inline styles; nothing else is served from the API.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    // Helmet's default is no-referrer, but OpenStreetMap's tile servers refuse
    // browser requests without a Referer ("Access blocked" tiles). Send only the
    // origin to other sites; full URLs (which contain student ids) stay private.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  app.use(cors({
    origin(origin, cb) {
      // Native mobile apps and server-to-server calls send no Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ success: true, data: { status: 'ok', database: 'up', time: new Date().toISOString() }, message: 'Healthy' });
    } catch {
      res.status(503).json({ success: false, message: 'Database unavailable', error: 'DB_DOWN' });
    }
  });

  app.use('/api/docs', docsRouter);
  app.use('/api', apiLimiter, noStore, api);
  app.use('/api', notFoundHandler);
  if (webDist) serveWeb(app, webDist);
  app.use(errorHandler);
  return app;
}

/**
 * Optional single-origin deployment: when WEB_DIST_DIR points at the built SPA
 * (frontend/dist), the API also serves it, with an SPA fallback and a CSP that
 * allows only the fonts and map tiles the app uses.
 */
const webDist = (() => {
  const dir = process.env.WEB_DIST_DIR;
  if (!dir) return null;
  const full = path.resolve(dir);
  return existsSync(path.join(full, 'index.html')) ? full : null;
})();

function serveWeb(app: express.Express, dir: string) {
  const csp = helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  });
  app.use(csp, express.static(dir, { index: false, maxAge: '7d', setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
  app.get(/^(?!\/api\/).*/, csp, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
}
