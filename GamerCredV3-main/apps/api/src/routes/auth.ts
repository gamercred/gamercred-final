import { Router, type Request, type Response } from 'express';
import openid from 'openid';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { readSession, writeSession, clearSession } from '../lib/session.js';
import { upsertUserFromSteam, ensureCred, syncFriends } from '../services/user.js';
import { logger } from '../lib/logger.js';
import { isAllowedOrigin, getApiBase, isValidSteamId, logAuditEvent } from '../lib/security.js';
import { STUB_MODE, stubRoster, findStubUser } from '../lib/stub.js';

const router = Router();

const STEAM_OPENID = 'https://steamcommunity.com/openid';

/**
 * Resolve the frontend origin from the ?base query, with strict allowlist enforcement.
 * Returns null if the provided base is missing or not allowed.
 */
function resolveFrontendOrigin(req: Request): string | null {
  const raw = (req.query.base as string | undefined)?.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  let normalized: string;
  try {
    const u = new URL(raw);
    normalized = `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
  normalized = normalized.replace(/\/$/, "");
  if (!isAllowedOrigin(normalized)) {
    logger.warn({ origin: normalized }, 'auth: frontend base rejected (not in allowlist)');
    return null;
  }
  return normalized;
}

/** HTML escape for safe interpolation into the popup response. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.get('/me', async (req, res) => {
  const s = readSession(req);
  if (!s) return res.json({ user: null });
  if (STUB_MODE) {
    return res.json({ user: findStubUser(s.steamId) });
  }
  const [u] = await db.select().from(users).where(eq(users.steamId, s.steamId));
  return res.json({ user: u ?? null });
});

// STUB-MODE ONLY — one-click "log in as a stub identity" so the UI works without real Steam.
// Disabled when STUB_MODE is off.
router.post('/stub-login', (_req, res) => {
  if (!STUB_MODE) return res.status(404).json({ error: 'not_found' });
  // Pick the #1 ranked stub user as "you"
  const me = stubRoster()[0];
  if (!me) return res.status(500).json({ error: 'stub_empty' });
  writeSession(res, me.steamId);
  res.json({ ok: true, user: me });
});

router.get('/steam', (req, res) => {
  const frontendOrigin = resolveFrontendOrigin(req);
  if (!frontendOrigin) {
    return res.status(400).send('Invalid or unauthorized base origin.');
  }
  const returnUrl = `${frontendOrigin}/api/auth/steam/callback?fb=${encodeURIComponent(frontendOrigin)}`;
  const realm = frontendOrigin;

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, false, []);
  relyingParty.authenticate(STEAM_OPENID, false, (err, authUrl) => {
    if (err || !authUrl) {
      logger.error({ err }, 'openid authenticate failed');
      return res.status(500).send('Authentication unavailable.');
    }
    res.redirect(authUrl);
  });
});

router.get('/steam/callback', (req, res) => {
  // Re-validate the frontend base; we encoded it ourselves but assume nothing.
  const rawFb = (req.query.fb as string | undefined) ?? '';
  const frontendOrigin = isAllowedOrigin(rawFb) ? rawFb.toLowerCase().replace(/\/$/, '') : null;

  const respondClose = (payload: { ok: boolean; steamId?: string; error?: string }) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Frame-Options', 'DENY');
    // Only postMessage to a verified origin. No '*' fallback.
    const safePayload = JSON.stringify(payload).replace(/</g, '\\u003c');
    const safeOrigin = frontendOrigin ? JSON.stringify(frontendOrigin) : 'null';
    const headline = payload.ok ? 'AUTH OK' : 'AUTH FAILED';
    const nonce = res.locals.nonce || '';
    res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(headline)}</title></head>
<body style="background:#020409;color:#0ff;font-family:monospace;padding:24px">
<p>${escapeHtml(headline)} &mdash; closing window&hellip;</p>
<script nonce="${nonce}">
  (function(){
    var msg = {type:"steam-cred-auth", payload:${safePayload}};
    var target = ${safeOrigin};
    try {
      if (target && window.opener) window.opener.postMessage(msg, target);
    } catch(e){}
    setTimeout(function(){ try { window.close(); } catch(e){} }, 300);
  })();
</script></body></html>`);
  };

  if (!frontendOrigin) {
    logger.warn({ rawFb }, 'callback: rejected fb origin');
    return respondClose({ ok: false, error: 'bad_origin' });
  }

  const returnUrl = `${frontendOrigin}/api/auth/steam/callback?fb=${encodeURIComponent(rawFb)}`;
  const realm = frontendOrigin;

  const relyingParty = new openid.RelyingParty(returnUrl, realm, true, false, []);
  relyingParty.verifyAssertion(req as any, async (err, result) => {
    if (err || !result || !result.authenticated || !result.claimedIdentifier) {
      logger.error({ err: err?.message, authed: result?.authenticated }, 'openid verify failed');
      return respondClose({ ok: false, error: 'verify_failed' });
    }
    // STRICT match: must be exactly the Steam OpenID identifier shape, no spoofed prefixes.
    const m = result.claimedIdentifier.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
    if (!m) {
      logger.warn({ id: result.claimedIdentifier }, 'unexpected claimed identifier shape');
      return respondClose({ ok: false, error: 'no_steamid' });
    }
    const steamId = m[1];
    if (!isValidSteamId(steamId)) {
      return respondClose({ ok: false, error: 'no_steamid' });
    }

    try {
      await upsertUserFromSteam(steamId);
      ensureCred(steamId).catch((e) => logger.warn({ steamId, err: e?.message }, 'cred bg calc failed'));
      syncFriends(steamId).catch((e) => logger.warn({ steamId, err: e?.message }, 'friends bg sync failed'));
      writeSession(res, steamId);
      await logAuditEvent({
        steamId,
        action: 'steam_login',
        details: 'User authenticated successfully via Steam OpenID',
        ipAddress: req.ip || '',
      });
      respondClose({ ok: true, steamId });
    } catch (e) {
      logger.error({ err: (e as Error).message }, 'upsert failed');
      respondClose({ ok: false, error: 'upsert_failed' });
    }
  });
});

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

export default router;
