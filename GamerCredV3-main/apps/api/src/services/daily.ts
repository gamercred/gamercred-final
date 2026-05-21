import { db } from '../db/index.js';
import { users, playtimeSnapshots } from '../db/schema.js';
import { eq, desc, and, lte, gte, inArray } from 'drizzle-orm';
import { STUB_MODE, stubRoster } from '../lib/stub.js';
import { logger } from '../lib/logger.js';

export interface DailyStats {
  steamId: string;
  personaName: string;
  avatar: string;
  country: string | null;
  totalHours: number;
  playtime24h: number;
  dailyCred: number;
}

/** Get stable daily stats for a stub user. */
export function getStubDailyStats(steamId: string) {
  const lastDigits = parseInt(steamId.slice(-4)) || 42;
  // Playtime between 0.5h and 7.5h
  const playtime24h = ((lastDigits % 15) + 1) * 0.5;
  const dailyCred = playtime24h * 15;
  return { playtime24h, dailyCred };
}

/** Get daily leaderboard operators. */
export async function getDailyLeaderboard(): Promise<DailyStats[]> {
  if (STUB_MODE) {
    const roster = stubRoster();
    const stats: DailyStats[] = roster.map((u) => {
      const { playtime24h, dailyCred } = getStubDailyStats(u.steamId);
      return {
        steamId: u.steamId,
        personaName: u.personaName,
        avatar: u.avatar,
        country: u.country || null,
        totalHours: u.totalHours,
        playtime24h,
        dailyCred,
      };
    });
    // Sort by daily cred desc
    return stats.sort((a, b) => b.dailyCred - a.dailyCred);
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  try {
    // 1. Find all users active in snapshots in the last 24h
    const recentSnapshots = await db
      .select({ steamId: playtimeSnapshots.steamId })
      .from(playtimeSnapshots)
      .where(gte(playtimeSnapshots.recordedAt, twentyFourHoursAgo));

    const uniqueSteamIds = Array.from(new Set(recentSnapshots.map((s) => s.steamId)));
    if (uniqueSteamIds.length === 0) {
      return [];
    }

    // 2. Fetch all matching users in bulk
    const activeUsers = await db
      .select()
      .from(users)
      .where(inArray(users.steamId, uniqueSteamIds));
    const userMap = new Map(activeUsers.map((u) => [u.steamId, u]));

    // 3. Fetch all playtime snapshots in the last 48 hours in bulk
    const allSnapshots = await db
      .select()
      .from(playtimeSnapshots)
      .where(
        and(
          inArray(playtimeSnapshots.steamId, uniqueSteamIds),
          gte(playtimeSnapshots.recordedAt, fortyEightHoursAgo)
        )
      )
      .orderBy(playtimeSnapshots.recordedAt); // Ascending: oldest first

    // Group snapshots by steamId in-memory
    const snapshotsByUser = new Map<string, typeof allSnapshots>();
    for (const snap of allSnapshots) {
      const list = snapshotsByUser.get(snap.steamId) ?? [];
      list.push(snap);
      snapshotsByUser.set(snap.steamId, list);
    }

    const list: DailyStats[] = [];

    for (const steamId of uniqueSteamIds) {
      const user = userMap.get(steamId);
      if (!user) continue;

      const userSnaps = snapshotsByUser.get(steamId) ?? [];

      // Find the most recent snapshot recorded more than 24 hours ago
      // Since they are sorted ascending, we look from the end of the array
      let baselineSnapshot = null;
      for (let i = userSnaps.length - 1; i >= 0; i--) {
        if (new Date(userSnaps[i].recordedAt).getTime() <= twentyFourHoursAgo.getTime()) {
          baselineSnapshot = userSnaps[i];
          break;
        }
      }

      let baselineHours = 0;
      if (baselineSnapshot) {
        baselineHours = baselineSnapshot.totalHours;
      } else {
        // Fallback: oldest snapshot recorded in the last 24h
        const oldestSnapshot = userSnaps.length > 0 ? userSnaps[0] : null;
        baselineHours = oldestSnapshot ? oldestSnapshot.totalHours : user.totalHours;
      }

      const playtime24h = Math.max(0, user.totalHours - baselineHours);
      const dailyCred = playtime24h * 15;

      // Only display users on the daily Top Guns if they actually earned cred
      if (dailyCred > 0) {
        list.push({
          steamId: user.steamId,
          personaName: user.personaName,
          avatar: user.avatar,
          country: user.country,
          totalHours: user.totalHours,
          playtime24h,
          dailyCred,
        });
      }
    }

    // Sort by daily cred desc
    return list.sort((a, b) => b.dailyCred - a.dailyCred);
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'Failed to compute daily leaderboard');
    return [];
  }
}

/** Get the single top daily spotlight user. */
export async function getDailySpotlight(): Promise<DailyStats | null> {
  const list = await getDailyLeaderboard();
  return list.length > 0 ? list[0] : null;
}
