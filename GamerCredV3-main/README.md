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
- `/versus?a=<id>&b=<id>` — Side-by-side compare + **Battle mini-game**
- `/friends` — Search & manage allies

## Versus Battle Mini-Game

The Versus page includes an RPG-style battle where two players fight using stats derived from their real Steam data.

### Stat Mapping

| Steam Data | Battle Stat | Formula | Cap |
|---|---|---|---|
| `totalGames` (games owned) | ⚔ **ATK** (Attack) | `totalGames × 0.3` | 999 |
| `totalHours` (total playtime) | ❤ **HP** (Hit Points) | `totalHours × 0.5` | 100–9999 |
| `avgRating` (avg game review %) | 🛡 **DEF** (Defense) | `avgRating × 100` | 100 |
| `credScore` | ⚡ **SPD** (Speed) | `credScore × 0.01` | 1–100 |

### Damage Formula

```
baseDamage = ATK × (1 - DEF_opponent / 200) × random(0.8–1.2) × 1.2
```

### Special Mechanics

| Mechanic | Chance / Trigger | Effect |
|---|---|---|
| **Critical Hit** | 15% per attack | 1.5× damage |
| **Miss** | 10% per attack | 0 damage |
| **Desperation** | Defender below 40% HP | Incoming damage × 1.8 |

### Battle Flow

1. **SPD** determines who attacks first (ties: coin flip)
2. Players alternate turns, each applying the damage formula
3. Fight ends when one player's HP reaches 0
4. Results show total turns, crits landed, and misses

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
