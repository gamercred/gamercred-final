import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger.js';
import { allowedOrigins, isAllowedOrigin, csrfGuard } from './lib/security.js';
import { STUB_MODE } from './lib/stub.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/api.js';
import crypto from 'node:crypto';

function requireEnv(name: string, opts: { minLen?: number } = {}) {
  const v = process.env[name];
  if (!v || (opts.minLen && v.length < opts.minLen)) {
    throw new Error(`Missing or invalid env: ${name}${opts.minLen ? ` (>= ${opts.minLen} chars)` : ''}`);
  }
}

if (STUB_MODE) {
  logger.warn('🟡 STUB_MODE enabled — using mock data. No Steam API or DB needed.');
  // Still require SESSION_SECRET so signed cookies work, but be lenient on others.
  requireEnv('SESSION_SECRET', { minLen: 32 });
} else {
  requireEnv('STEAM_API_KEY');
  requireEnv('DATABASE_URL');
  requireEnv('SESSION_SECRET', { minLen: 32 });
}

if (!process.env.CORS_ORIGINS) {
  logger.warn('CORS_ORIGINS is empty — frontend will not be able to call the API');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req: any, res: any) => `'nonce-${res.locals.nonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          "data:",
          "https://avatars.steamstatic.com",
          "https://avatars.cloudflare.steamstatic.com",
          "https://shared.cloudflare.steamstatic.com",
          "https://shared.fastly.steamstatic.com",
        ],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

app.use(express.json({ limit: '16kb' }));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      logger.warn({ origin, allowed: allowedOrigins() }, 'CORS blocked');
      return cb(new Error('CORS not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 600,
  })
);

const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
app.use(globalLimiter);

const steamLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

app.get('/health', (_req, res) => res.json({ ok: true, stub: STUB_MODE }));

app.use('/api', csrfGuard);
app.use('/api/auth/steam', authLimiter);
app.use('/api/users', steamLimiter);
app.use('/api/games', steamLimiter);

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err: any, req: any, res: any, _next: any) => {
  logger.error({ err: err?.message, stack: err?.stack, path: req?.path }, 'unhandled error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'server_error' });
});

const port = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(port, () => {
    logger.info({ port, env: process.env.NODE_ENV, stub: STUB_MODE, allowed: allowedOrigins() }, 'steam-cred API listening');
  });
}

export default app;
