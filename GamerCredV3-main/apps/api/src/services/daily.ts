import { db } from '../db/index.js';
import { users, playtimeSnapshots } from '../db/schema.js';
import { eq, desc, and, lte, gte } from 'drizzle-orm';
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

  try {
    // Find all users active in snapshots in the last 24h
    const recentSnapshots = await db
      .select({ steamId: playtimeSnapshots.steamId })
      .from(playtimeSnapshots)
      .where(gte(playtimeSnapshots.recordedAt, twentyFourHoursAgo));

    const uniqueSteamIds = Array.from(new Set(recentSnapshots.map((s) => s.steamId)));

    const list: DailyStats[] = [];

    for (const steamId of uniqueSteamIds) {
      const [user] = await db.select().from(users).where(eq(users.steamId, steamId));
      if (!user) continue;

      // Query baseline snapshot from > 24 hours ago
      const baseSnapshot = await db
        .select()
        .from(playtimeSnapshots)
        .where(
          and(
            eq(playtimeSnapshots.steamId, steamId),
            lte(playtimeSnapshots.recordedAt, twentyFourHoursAgo)
          )
        )
        .orderBy(desc(playtimeSnapshots.recordedAt))
        .limit(1);

      let baselineHours = 0;
      if (baseSnapshot.length > 0) {
        baselineHours = baseSnapshot[0].totalHours;
      } else {
        // Fallback: oldest snapshot in the last 24h
        const oldestSnapshot = await db
          .select()
          .from(playtimeSnapshots)
          .where(
            and(
              eq(playtimeSnapshots.steamId, steamId),
              gte(playtimeSnapshots.recordedAt, twentyFourHoursAgo)
            )
          )
          .orderBy(playtimeSnapshots.recordedAt) // Ascending order = oldest first
          .limit(1);

        baselineHours = oldestSnapshot.length > 0 ? oldestSnapshot[0].totalHours : user.totalHours;
      }

      const playtime24h = Math.max(0, user.totalHours - baselineHours);
      const dailyCred = playtime24h * 15;

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
