import { db } from '../db/index.js';
import { users, friendships, playtimeSnapshots } from '../db/schema.js';
import { eq, sql, desc } from 'drizzle-orm';
import {
  getPlayerSummary,
  getOwnedGames,
  getRatings,
  enrichGames,
  calculateCred,
  getFriendList,
  type EnrichedGame,
  type SteamPlayer,
} from './steam.js';
import type { User } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import crypto from 'node:crypto';

const CRED_TTL_MS = 15 * 60 * 1000;

export async function upsertUserFromSteam(steamId: string): Promise<User | null> {
  const player = await getPlayerSummary(steamId);
  if (!player) return null;
  const values = {
    steamId: player.steamid,
    personaName: player.personaname ?? 'Unknown',
    avatar: player.avatarfull ?? '',
    profileUrl: player.profileurl ?? '',
    country: player.loccountrycode ?? null,
  };
  const [row] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.steamId,
      set: {
        personaName: sql`excluded.persona_name`,
        avatar: sql`excluded.avatar`,
        profileUrl: sql`excluded.profile_url`,
        country: sql`excluded.country`,
      },
    })
    .returning();
  return row ?? null;
}

export async function ensureCred(
  steamId: string,
  opts: { force?: boolean } = {}
): Promise<{ user: User; games: EnrichedGame[] }> {
  let user = (await db.select().from(users).where(eq(users.steamId, steamId)))[0];
  if (!user) {
    const created = await upsertUserFromSteam(steamId);
    if (!created) throw new Error('STEAM_USER_NOT_FOUND');
    user = created;
  }
  const stale =
    opts.force ||
    !user.lastCalculatedAt ||
    Date.now() - new Date(user.lastCalculatedAt).getTime() > CRED_TTL_MS;

  if (!stale) {
    // Return user as-is, but still need to load games for display
    const games = await getOwnedGames(steamId);
    const ratings = await getRatings(games);
    const enriched = enrichGames(games, ratings);
    return { user, games: enriched };
  }

  logger.info({ steamId }, 'calculating CRED');
  const games = await getOwnedGames(steamId);
  const ratings = await getRatings(games);
  const enriched = enrichGames(games, ratings);
  const { cred, totalHours, avgRating } = calculateCred(enriched);

  const [updated] = await db
    .update(users)
    .set({
      credScore: cred,
      totalGames: enriched.length,
      totalHours,
      avgRating,
      lastCalculatedAt: new Date(),
    })
    .where(eq(users.steamId, steamId))
    .returning();

  // Throttled snapshot recording (max once per 30 minutes)
  try {
    const lastSnapshot = await db
      .select()
      .from(playtimeSnapshots)
      .where(eq(playtimeSnapshots.steamId, steamId))
      .orderBy(desc(playtimeSnapshots.recordedAt))
      .limit(1);

    if (!lastSnapshot.length || Date.now() - new Date(lastSnapshot[0].recordedAt).getTime() > 30 * 60 * 1000) {
      await db.insert(playtimeSnapshots).values({
        id: crypto.randomUUID(),
        steamId,
        totalHours,
        recordedAt: new Date(),
      });
      logger.info({ steamId, totalHours }, 'Recorded user playtime snapshot');
    }
  } catch (err) {
    logger.warn({ steamId, err: (err as Error).message }, 'Failed to record user playtime snapshot');
  }

  return { user: updated ?? user, games: enriched };
}

export async function syncFriends(steamId: string): Promise<void> {
  try {
    logger.info({ steamId }, 'syncFriends: Fetching friends list from Steam');
    const friends = await getFriendList(steamId);
    if (friends.length === 0) {
      logger.info({ steamId }, 'syncFriends: No friends found or friends list is private');
      return;
    }

    const friendSteamIds = friends.map((f) => f.steamid);
    logger.info({ steamId, count: friendSteamIds.length }, 'syncFriends: Found friends, importing summaries...');

    // Fetch summaries in batches of 100 (Steam's limit per request)
    const CHUNK = 100;
    const summaries: SteamPlayer[] = [];
    const key = () => {
      const k = process.env.STEAM_API_KEY;
      if (!k) throw new Error('STEAM_API_KEY missing');
      return k;
    };

    for (let i = 0; i < friendSteamIds.length; i += CHUNK) {
      const batch = friendSteamIds.slice(i, i + CHUNK);
      const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${key()}&steamids=${batch.join(',')}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: any = await res.json();
        const players = data?.response?.players ?? [];
        summaries.push(...players);
      }
    }

    logger.info({ steamId, publicCount: summaries.length }, 'syncFriends: Syncing public friend profiles to DB...');

    for (const f of summaries) {
      // Upsert friend profile
      const values = {
        steamId: f.steamid,
        personaName: f.personaname ?? 'Unknown',
        avatar: f.avatarfull ?? '',
        profileUrl: f.profileurl ?? '',
        country: f.loccountrycode ?? null,
      };

      await db
        .insert(users)
        .values(values)
        .onConflictDoUpdate({
          target: users.steamId,
          set: {
            personaName: sql`excluded.persona_name`,
            avatar: sql`excluded.avatar`,
            profileUrl: sql`excluded.profile_url`,
            country: sql`excluded.country`,
          },
        });

      // Insert friendship links
      await db
        .insert(friendships)
        .values({ userSteamId: steamId, friendSteamId: f.steamid })
        .onConflictDoNothing();

      // Launch background CRED score calculation for public friend accounts
      ensureCred(f.steamid).catch((e) => {
        logger.warn({ friendId: f.steamid, err: e?.message }, 'syncFriends: Background CRED calc failed for friend');
      });
    }

    logger.info({ steamId }, 'syncFriends: Friends list syncing complete!');
  } catch (e) {
    logger.error({ steamId, err: (e as Error).message }, 'syncFriends: Sync failed');
  }
}
