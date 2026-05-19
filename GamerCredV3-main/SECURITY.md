# SECURITY

This app handles Steam OpenID sign-ins and a public leaderboard. Here's every defensive measure baked in, why, and what it protects against.

## Auth & sessions

- **Session cookie** is HMAC-signed (SHA-256). Server has the secret; clients can't forge.
- **Cookie attributes**: `HttpOnly` (no JS access → XSS-resistant), `SameSite=Lax` in dev / `SameSite=None; Secure` in prod (required for cross-origin popup auth), 30-day expiry encoded inside the signed payload.
- **Secret length** ≥ 32 chars, enforced at boot. App refuses to start otherwise.
- **Steam OpenID assertion** is verified server-side via the `openid` library; the claimed identifier must match the exact pattern `https://steamcommunity.com/openid/id/<17 digits>` — no prefix tricks.

## OpenID popup flow — the high-risk path

The popup pattern is convenient but historically a hotbed for **open-redirect** and **postMessage** flaws. Here's how we lock it down:

- **`?base=` is allowlisted, not echoed.** When the frontend calls `/api/auth/steam?base=<origin>`, the server checks the value against `CORS_ORIGINS`. Anything else → 400. No way to redirect users to attacker-controlled URLs via this param.
- **`postMessage` target is never `'*'`.** The popup posts the auth result only to the verified frontend origin. If the origin can't be verified, the popup closes silently without posting anything.
- **Popup payload is JSON-encoded with `<` → `\u003c`** to neuter HTML-injection attempts via the parameter.
- **Client-side message handler** checks `e.source === popup` (not just origin), so a hostile iframe or sibling tab can't spoof an auth-success message.

## CSRF

- **Custom-header CSRF guard** on every non-GET request to `/api/*`: requires `X-Requested-With: steam-cred`. Browsers won't allow this header on cross-site form posts without a preflight; the preflight will be blocked by CORS unless the origin is allowlisted.
- **Origin/Referer check** on the same mutations as a second factor. Both must pass.
- **`SameSite=None`** on session cookies in prod is necessary for popup auth — these CSRF checks compensate.

## Input validation

- **Steam IDs** validated against `/^\d{17}$/` everywhere they're accepted (route params, query strings, body).
- **Search queries** capped at 64 chars; SQL `LIKE` wildcards `%` and `_` escaped before interpolation.
- **JSON body limit**: 16 KB. We never accept large payloads.
- **`zod`** for body schema parsing on `POST /friends`.

## Rate limiting

- **Global**: 120 req / IP / min.
- **Steam-touching endpoints** (`/users/*`, `/games/*`): 30 req / IP / min — bounds upstream Steam API spend.
- **Auth start** (`/api/auth/steam`): 10 req / IP / min — bounds popup-spam abuse.
- **`trust proxy: 1`** so rate limiting sees the real client IP via `X-Forwarded-For` from Codespaces / Vercel / Cloudflare / Fly.

## CORS

- **Strict allowlist**. `Origin` must exact-match an entry in `CORS_ORIGINS` (scheme + host, lowercased, no trailing slash). No regex, no `*`.
- **`credentials: true`** with allowlisted origins so cookies flow only to known frontends.
- **Methods**: `GET`, `POST`, `DELETE` only.
- **Headers**: `Content-Type`, `X-Requested-With` only — anything else triggers a preflight that fails.

## HTTP headers

- **`helmet`** applied: sets `X-Content-Type-Options: nosniff`, `X-DNS-Prefetch-Control`, `Strict-Transport-Security`, `X-Download-Options`, `Origin-Agent-Cluster`, hides `X-Powered-By`.
- **`X-Frame-Options: DENY`** explicitly on the popup callback page — prevents clickjacking even if helmet is bypassed.
- **`Cache-Control: no-store`** on the auth callback — prevents the auth-result HTML from being cached by intermediate proxies.

## Database

- **No raw SQL with user input.** Every query is parameterized via Drizzle's query builder.
- **Schema is least-privilege at the row level.** The session payload only stores a Steam ID; everything else is derived server-side.
- **Friend insertions** require the target Steam ID to resolve to a real Steam profile, blocking enumeration of garbage IDs into the friendships table.

## Error handling

- **Never leak stack traces or internal error messages** to clients. The last-resort middleware returns `{"error":"server_error"}` and logs the real cause via Pino.
- **Endpoint-level errors** are typed (`not_found`, `invalid_steam_id`, `rate_limited`, `unauthorized`, `forbidden`, `bad_input`, `server_error`).

## Env & boot

- App **refuses to start** if `STEAM_API_KEY`, `DATABASE_URL`, or `SESSION_SECRET` (≥32 chars) are missing.
- `.env` is **gitignored**.
- `x-powered-by` header **disabled** (no Express fingerprint).

## What's NOT here (and why)

- **No user-uploaded content** anywhere → no image/file validation needed.
- **No payments** in v0.1 → no PCI surface.
- **No password storage** — Steam handles all credentials. We never see them.
- **No email** — no phishing-via-our-domain risk.

## Future hardening worth considering

- Move to a **server-side session store** (Postgres or Redis) so sessions can be revoked centrally (currently signed cookies are valid until expiry).
- **Captcha** on `/api/users/search` and `/api/auth/steam` if scraping becomes a problem.
- **CSP** header tuned for the frontend (currently helmet's default CSP is off because the OpenID callback uses inline scripts).
- **Audit log table** for friend add/remove and login events.
- **Steam ID enumeration rate limit** on `/api/users/:steamId` keyed by `(IP, steamId-prefix)` to avoid scraping the entire Steam graph.
