import crypto from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'sc_sess';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set (>=32 chars). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function encode(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decode(token: string): SessionData | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // timing-safe
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionData;
    if (data.exp && data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export interface SessionData {
  steamId: string;
  exp: number;
}

export function readSession(req: Request): SessionData | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const found = raw
    .split(';')
    .map((s) => s.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!found) return null;
  const token = decodeURIComponent(found.slice(COOKIE_NAME.length + 1));
  return decode(token);
}

export function writeSession(res: Response, steamId: string) {
  const data: SessionData = { steamId, exp: Date.now() + MAX_AGE_MS };
  const token = encode(data);
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
    `HttpOnly`,
    `SameSite=${isProd ? 'None' : 'Lax'}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSession(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=`,
    `Path=/`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=${isProd ? 'None' : 'Lax'}`,
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
