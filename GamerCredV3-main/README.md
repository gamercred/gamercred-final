# STEAM CRED

Retro-arcade gaming credit score web app. Connect Steam → get a CRED score → compete globally.

```
CRED = (GAMES × 10) + Σ (RATING × HOURS)
```

## Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React + Vite + TypeScript, Tailwind, wouter, TanStack Query
- **Backend**: Node + Express + TypeScript, Drizzle ORM, Supabase Postgres
- **Auth**: Steam OpenID 2.0 (popup flow), HMAC-signed cookie sessions
- **Visuals**: VT323 @ 140% base, neon cyan/magenta on near-black, animated canvas geometric background, CRT scanlines, procedural Web Audio chiptune

## Setup

### 1. Install deps

```bash
pnpm install
```

### 2. Configure backend env

```bash
cp apps/api/.env.example apps/api/.env
```

Fill in:

- `STEAM_API_KEY` — https://steamcommunity.com/dev/apikey
- `DATABASE_URL` — Supabase pooled connection (Settings → Database → Connection string → URI, Transaction pooler, port 6543)
- `SESSION_SECRET` — **must be ≥32 chars**, gen with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `CORS_ORIGINS` — comma-separated frontend origins, no trailing slash. e.g. your Codespaces 5173 forwarded URL. This single list is enforced for CORS, the OpenID `?base=` allowlist, and CSRF origin checks.

### 3. Push schema

```bash
cd apps/api && pnpm db:push && cd ../..
```

### 4. Run both apps

```bash
pnpm dev
```

API on `:4000`, web on `:5173`.

### 5. In Codespaces

Make ports **4000** and **5173** **Public** (right-click port → Port Visibility → Public).
Add the forwarded 5173 URL to `CORS_ORIGINS` in `apps/api/.env` and restart.

## Routes

- `/` — Home: ticker, search, leaderboard preview, friends sidebar
- `/login` — Connect with Steam (popup)
- `/leaderboard` — Global rankings
- `/player/:steamId` — Profile + 60-game library
- `/versus?a=<id>&b=<id>` — Side-by-side compare
- `/friends` — Search & manage allies

## Key API endpoints

```
GET    /api/auth/me
GET    /api/auth/steam?base=<origin>
GET    /api/auth/steam/callback
POST   /api/auth/logout
GET    /api/leaderboard
GET    /api/games/top-rated
GET    /api/users/:steamId
GET    /api/games/owned?steamId=...
GET    /api/users/search?q=...
GET    /api/friends
POST   /api/friends           # { steamId }
DELETE /api/friends/:steamId
```

## Notes

- **Chiptune** is procedural Web Audio (no audio files). Toggle bottom-right.
- **Ticker** has a hardcoded fallback list so homepage never shows empty.
- **Steam OpenID popup** passes `?base=<origin>` so the callback URL works in dev and prod identically.
- **CRED cache**: 15 min per user. **Game rating cache**: 7 days in Postgres.
- **Trust proxy** is on (`app.set('trust proxy', 1)`) — works behind Codespaces, Vercel, Fly, etc.

## Security

See [`SECURITY.md`](./SECURITY.md) for the full hardening writeup — origin allowlists, CSRF, rate limits, helmet, input validation, the works.
