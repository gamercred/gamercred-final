import type { Request, Response, NextFunction } from 'express';
import { logger } from './logger.js';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema.js';
import { STUB_MODE } from './stub.js';
import * as crypto from 'node:crypto';

/**
 * Parse CORS_ORIGINS env into a normalized allowlist.
 * Each entry: scheme + host (no path, no trailing slash), lowercased.
 */
function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

let cachedAllowlist: string[] | null = null;
export function allowedOrigins(): string[] {
  if (cachedAllowlist) return cachedAllowlist;
  const raw = process.env.CORS_ORIGINS ?? '';
  cachedAllowlist = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\/$/, '').toLowerCase());
  return cachedAllowlist;
}

/** Strictly validate that an origin is in the allowlist. */
export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const normalized = `${u.protocol}//${u.host}`.toLowerCase();
    return allowedOrigins().some(o => {
      const norm = trimSlash(o);
      if (norm.includes('*.')) {
        const suffix = norm.split('*.')[1];
        const proto = norm.startsWith('https://') ? 'https://' : 'http://';
        return normalized.startsWith(proto) && normalized.endsWith('.' + suffix);
      }
      return norm === trimSlash(normalized);
    });
  } catch {
    return false;
  }
}

/** Pull the API's own canonical base URL from env, fallback to request. */
export function getApiBase(req: Request): string {
  const env = process.env.API_BASE_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers.host;
  return `${proto}://${host}`;
}

/** Validate a Steam ID is the canonical 17-digit form. */
export function isValidSteamId(v: unknown): v is string {
  return typeof v === 'string' && /^\d{17}$/.test(v);
}

/** Escape LIKE special chars so wildcards in user input are literal. */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * CSRF guard for state-changing requests.
 * Strategy: require either
 *  (a) Origin header in allowlist, OR
 *  (b) X-Requested-With: steam-cred (proves it's our JS, not a cross-site form post)
 * Both checks together = belt and suspenders. We require BOTH.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  // GET/HEAD/OPTIONS pass through
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const origin = req.headers.origin || req.headers.referer;
  const originOk = isAllowedOrigin(origin as string);
  const xrwOk = req.headers['x-requested-with'] === 'steam-cred';
  if (!originOk || !xrwOk) {
    logger.warn(
      { method: req.method, path: req.path, origin, xrw: req.headers['x-requested-with'] },
      'csrf check failed'
    );
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

/**
 * Log a security-sensitive event to the audit_logs table (or console/logger in stub mode)
 */
export async function logAuditEvent(params: {
  steamId: string;
  action: string;
  details?: string;
  ipAddress?: string;
}) {
  const logId = crypto.randomUUID();
  const event = {
    id: logId,
    steamId: params.steamId,
    action: params.action,
    details: params.details || null,
    ipAddress: params.ipAddress || null,
    createdAt: new Date(),
  };

  logger.info({ event }, `Audit event logged: ${params.action}`);

  if (STUB_MODE) {
    return;
  }

  try {
    await db.insert(auditLogs).values(event);
  } catch (err) {
    logger.error({ err, event }, 'Failed to insert audit log to DB');
  }
}
