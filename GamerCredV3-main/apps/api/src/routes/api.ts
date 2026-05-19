import { Router } from 'express';
import { db } from '../db/index.js';
import { users, friendships } from '../db/schema.js';
import { eq, ilike, desc, and } from 'drizzle-orm';
import { readSession } from '../lib/session.js';
import { ensureCred, syncFriends } from '../services/user.js';
import { getTopRatedGames, resolveVanity } from '../services/steam.js';
import { logger } from '../lib/logger.js';
import { isValidSteamId, escapeLike, logAuditEvent } from '../lib/security.js';
import { STUB_MODE, stubRoster, findStubUser, buildStubLibrary, topRatedStub } from '../lib/stub.js';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { getDailyLeaderboard, getDailySpotlight } from '../services/daily.js';

const router = Router();

const profileScrapeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

// In-memory friendships for stub mode
const stubFriendships = new Map<string, Set<string>>();

router.get('/leaderboard', async (_req, res) => {
  if (STUB_MODE) {
    return res.json({ users: stubRoster() });
  }
  const rows = await db
    .select({
      steamId: users.steamId,
      personaName: users.personaName,
      avatar: users.avatar,
      country: users.country,
      credScore: users.credScore,
      totalGames: users.totalGames,
      totalHours: users.totalHours,
      avgRating: users.avgRating,
    })
    .from(users)
    .orderBy(desc(users.credScore))
    .limit(100);
  res.json({ users: rows });
});

router.get('/leaderboard/daily', async (_req, res) => {
  const users = await getDailyLeaderboard();
  res.json({ users });
});

router.get('/spotlight/daily', async (_req, res) => {
  const spotlight = await getDailySpotlight();
  res.json({ spotlight });
});

router.get('/games/top-rated', async (_req, res) => {
  if (STUB_MODE) {
    return res.json({ games: topRatedStub() });
  }
  const games = await getTopRatedGames(40);
  res.json({ games });
});

router.get('/users/:steamId', profileScrapeLimiter, async (req, res) => {
  const steamId = req.params.steamId;
  if (!isValidSteamId(steamId)) return res.status(400).json({ error: 'invalid_steam_id' });

  if (STUB_MODE) {
    const user = findStubUser(steamId);
    if (!user) return res.status(404).json({ error: 'not_found' });
    return res.json({ user, games: buildStubLibrary(steamId) });
  }

  try {
    const { user, games } = await ensureCred(steamId);
    res.json({ user, games });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'STEAM_USER_NOT_FOUND') return res.status(404).json({ error: 'not_found' });
    logger.error({ steamId, err: msg }, 'profile fetch failed');
    res.status(500).json({ error: 'fetch_failed' });
  }
});

router.get('/games/owned', async (req, res) => {
  const steamId = (req.query.steamId as string | undefined)?.trim();
  if (!isValidSteamId(steamId)) return res.status(400).json({ error: 'invalid_steam_id' });

  if (STUB_MODE) {
    return res.json({ games: buildStubLibrary(steamId) });
  }

  try {
    const { games } = await ensureCred(steamId);
    res.json({ games });
  } catch (e) {
    logger.error({ steamId, err: (e as Error).message }, 'owned-games fetch failed');
    res.status(500).json({ error: 'fetch_failed' });
  }
});

const searchSchema = z.object({ q: z.string().min(1).max(64) });

router.get('/users/search', async (req, res) => {
  const parsed = searchSchema.safeParse({ q: (req.query.q as string | undefined)?.trim() ?? '' });
  if (!parsed.success) return res.json({ results: [] });
  const q = parsed.data.q;

  if (STUB_MODE) {
    if (isValidSteamId(q)) {
      const u = findStubUser(q);
      return res.json({ results: u ? [u] : [] });
    }
    const lower = (q as string).toLowerCase();
    const results = stubRoster().filter((u) => u.personaName.toLowerCase().includes(lower));
    return res.json({ results });
  }

  if (isValidSteamId(q)) {
    try {
      const { user } = await ensureCred(q);
      return res.json({ results: [user] });
    } catch {
      return res.json({ results: [] });
    }
  }

  const sid = await resolveVanity(q).catch(() => null);
  if (sid && isValidSteamId(sid)) {
    try {
      const { user } = await ensureCred(sid);
      return res.json({ results: [user] });
    } catch {
      // fall through
    }
  }

  const safe = escapeLike(q);
  const rows = await db
    .select({
      steamId: users.steamId,
      personaName: users.personaName,
      avatar: users.avatar,
      country: users.country,
      credScore: users.credScore,
      totalGames: users.totalGames,
      totalHours: users.totalHours,
      avgRating: users.avgRating,
    })
    .from(users)
    .where(ilike(users.personaName, `%${safe}%`))
    .limit(20);
  res.json({ results: rows });
});

const friendBody = z.object({ steamId: z.string().regex(/^\d{17}$/) });

router.get('/friends', async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });

  if (STUB_MODE) {
    const set = stubFriendships.get(s.steamId) ?? new Set<string>();
    const friends = Array.from(set)
      .map((id) => findStubUser(id))
      .filter(Boolean)
      .map((u) => ({
        steamId: u!.steamId,
        personaName: u!.personaName,
        avatar: u!.avatar,
        credScore: u!.credScore,
      }));
    return res.json({ friends });
  }

  let rows = await db
    .select({
      steamId: users.steamId,
      personaName: users.personaName,
      avatar: users.avatar,
      credScore: users.credScore,
    })
    .from(friendships)
    .innerJoin(users, eq(users.steamId, friendships.friendSteamId))
    .where(eq(friendships.userSteamId, s.steamId));

  if (rows.length === 0) {
    logger.info({ steamId: s.steamId }, 'No friends in DB, triggering on-demand sync');
    await syncFriends(s.steamId).catch((e) => logger.warn({ err: e.message }, 'on-demand sync failed'));
    
    rows = await db
      .select({
        steamId: users.steamId,
        personaName: users.personaName,
        avatar: users.avatar,
        credScore: users.credScore,
      })
      .from(friendships)
      .innerJoin(users, eq(users.steamId, friendships.friendSteamId))
      .where(eq(friendships.userSteamId, s.steamId));
  }

  res.json({ friends: rows });
});

router.post('/friends', async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const parsed = friendBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'bad_input' });
  if (parsed.data.steamId === s.steamId) return res.status(400).json({ error: 'cannot_friend_self' });

  if (STUB_MODE) {
    if (!findStubUser(parsed.data.steamId)) return res.status(404).json({ error: 'steam_profile_not_found' });
    const set = stubFriendships.get(s.steamId) ?? new Set<string>();
    set.add(parsed.data.steamId);
    stubFriendships.set(s.steamId, set);
    await logAuditEvent({
      steamId: s.steamId,
      action: 'friend_add',
      details: `Added friend ${parsed.data.steamId} (stub mode)`,
      ipAddress: req.ip || '',
    });
    return res.json({ ok: true });
  }

  try {
    const ensured = await ensureCred(parsed.data.steamId).catch(() => null);
    if (!ensured) return res.status(404).json({ error: 'steam_profile_not_found' });
    await db
      .insert(friendships)
      .values({ userSteamId: s.steamId, friendSteamId: parsed.data.steamId })
      .onConflictDoNothing();
    await logAuditEvent({
      steamId: s.steamId,
      action: 'friend_add',
      details: `Added friend ${parsed.data.steamId}`,
      ipAddress: req.ip || '',
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: (e as Error).message }, 'add friend failed');
    res.status(500).json({ error: 'server_error' });
  }
});

router.delete('/friends/:steamId', async (req, res) => {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const target = req.params.steamId;
  if (!isValidSteamId(target)) return res.status(400).json({ error: 'invalid_steam_id' });

  if (STUB_MODE) {
    const set = stubFriendships.get(s.steamId);
    if (set) set.delete(target);
    await logAuditEvent({
      steamId: s.steamId,
      action: 'friend_remove',
      details: `Removed friend ${target} (stub mode)`,
      ipAddress: req.ip || '',
    });
    return res.json({ ok: true });
  }

  await db
    .delete(friendships)
    .where(and(eq(friendships.userSteamId, s.steamId), eq(friendships.friendSteamId, target)));
  await logAuditEvent({
    steamId: s.steamId,
    action: 'friend_remove',
    details: `Removed friend ${target}`,
    ipAddress: req.ip || '',
  });
  res.json({ ok: true });
});

export default router;
