import { db } from '../db/index.js';
import { gameRatings } from '../db/schema.js';
import { inArray, sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const STORE_API_BASE = 'https://store.steampowered.com';

function key() {
  const k = process.env.STEAM_API_KEY;
  if (!k) throw new Error('STEAM_API_KEY missing');
  return k;
}

export interface SteamPlayer {
  steamid: string;
  personaname: string;
  avatarfull: string;
  profileurl: string;
  loccountrycode?: string;
}

export interface OwnedGame {
  appid: number;
  name: string;
  playtime_forever: number; // minutes
  img_icon_url?: string;
  img_logo_url?: string;
}

export interface EnrichedGame extends OwnedGame {
  hours: number;
  positivePct: number;
  reviewCount: number;
  cover: string;
}

const RATING_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getPlayerSummary(steamId: string): Promise<SteamPlayer | null> {
  const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/?key=${key()}&steamids=${steamId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: any = await res.json();
  const player = data?.response?.players?.[0];
  return player ?? null;
}

export async function resolveVanity(vanity: string): Promise<string | null> {
  const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v0001/?key=${key()}&vanityurl=${encodeURIComponent(vanity)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data: any = await res.json();
  if (data?.response?.success === 1) return data.response.steamid as string;
  return null;
}

export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
  const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/?key=${key()}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: any = await res.json();
  const games: OwnedGame[] = data?.response?.games ?? [];
  return games;
}

/**
 * Steam Store appreviews endpoint returns total_positive / total_reviews.
 * Cached in DB for 7 days.
 */
async function fetchReviewRatingFromStore(appId: number): Promise<{ positivePct: number; reviewCount: number }> {
  try {
    const url = `${STORE_API_BASE}/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`;
    const res = await fetch(url, { headers: { 'user-agent': 'steam-cred/0.1' } });
    if (!res.ok) return { positivePct: 0, reviewCount: 0 };
    const data: any = await res.json();
    const total = data?.query_summary?.total_reviews ?? 0;
    const pos = data?.query_summary?.total_positive ?? 0;
    const pct = total > 0 ? pos / total : 0;
    return { positivePct: pct, reviewCount: total };
  } catch (e) {
    logger.warn({ appId, err: (e as Error).message }, 'review fetch failed');
    return { positivePct: 0, reviewCount: 0 };
  }
}

/**
 * Get review ratings for a batch of appIds.
 * Returns map appId -> { positivePct, reviewCount, name }.
 * Cache lookup first; fetch fresh in parallel batches of 12 for misses.
 */
export async function getRatings(games: OwnedGame[]): Promise<Map<number, { positivePct: number; reviewCount: number; name: string }>> {
  const result = new Map<number, { positivePct: number; reviewCount: number; name: string }>();
  if (games.length === 0) return result;
  const appIds = games.map((g) => g.appid);

  // Cache lookup
  const cached = await db.select().from(gameRatings).where(inArray(gameRatings.appId, appIds));
  const now = Date.now();
  const fresh = new Set<number>();
  for (const row of cached) {
    if (row.updatedAt && now - new Date(row.updatedAt).getTime() < RATING_TTL_MS) {
      fresh.add(row.appId);
      result.set(row.appId, { positivePct: row.positivePct, reviewCount: row.reviewCount, name: row.name });
    }
  }

  const toFetch = games.filter((g) => !fresh.has(g.appid));

  // Parallel fetch in chunks of 12
  const CHUNK = 12;
  for (let i = 0; i < toFetch.length; i += CHUNK) {
    const slice = toFetch.slice(i, i + CHUNK);
    const fetched = await Promise.all(
      slice.map(async (g) => {
        const r = await fetchReviewRatingFromStore(g.appid);
        return { game: g, ...r };
      })
    );
    // Upsert
    if (fetched.length > 0) {
      const rows = fetched.map((f) => ({
        appId: f.game.appid,
        name: f.game.name ?? '',
        positivePct: f.positivePct,
        reviewCount: f.reviewCount,
        updatedAt: new Date(),
      }));
      try {
        await db
          .insert(gameRatings)
          .values(rows)
          .onConflictDoUpdate({
            target: gameRatings.appId,
            set: {
              name: sql`excluded.name`,
              positivePct: sql`excluded.positive_pct`,
              reviewCount: sql`excluded.review_count`,
              updatedAt: sql`excluded.updated_at`,
            },
          });
      } catch (e) {
        logger.warn({ err: (e as Error).message }, 'rating upsert failed');
      }
      for (const f of fetched) {
        result.set(f.game.appid, { positivePct: f.positivePct, reviewCount: f.reviewCount, name: f.game.name ?? '' });
      }
    }
  }

  return result;
}

export function enrichGames(games: OwnedGame[], ratings: Map<number, { positivePct: number; reviewCount: number }>): EnrichedGame[] {
  return games.map((g) => {
    const r = ratings.get(g.appid) ?? { positivePct: 0, reviewCount: 0 };
    const hours = (g.playtime_forever ?? 0) / 60;
    const cover = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appid}/capsule_231x87.jpg`;
    return {
      ...g,
      hours,
      positivePct: r.positivePct,
      reviewCount: r.reviewCount,
      cover,
    };
  });
}

/**
 * CRED = (num_games * 10) + Σ (rating * hours)
 */
export function calculateCred(enriched: EnrichedGame[]): {
  cred: number;
  totalHours: number;
  avgRating: number;
} {
  const totalHours = enriched.reduce((acc, g) => acc + g.hours, 0);
  const ratedGames = enriched.filter((g) => g.reviewCount > 0);
  const avgRating = ratedGames.length > 0 ? ratedGames.reduce((a, g) => a + g.positivePct, 0) / ratedGames.length : 0;
  const weighted = enriched.reduce((acc, g) => acc + g.positivePct * g.hours, 0);
  const cred = enriched.length * 10 + weighted;
  return { cred, totalHours, avgRating };
}

export async function getTopRatedGames(limit = 30): Promise<{ appId: number; name: string; positivePct: number; cover: string }[]> {
  const rows = await db.select().from(gameRatings);
  return rows
    .filter((r) => r.reviewCount >= 1000)
    .sort((a, b) => b.positivePct - a.positivePct)
    .slice(0, limit)
    .map((r) => ({
      appId: r.appId,
      name: r.name,
      positivePct: r.positivePct,
      cover: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${r.appId}/capsule_231x87.jpg`,
    }));
}

export interface SteamFriend {
  steamid: string;
  relationship: string;
  friend_since: number;
}

export async function getFriendList(steamId: string): Promise<SteamFriend[]> {
  try {
    const url = `${STEAM_API_BASE}/ISteamUser/GetFriendList/v0001/?key=${key()}&steamid=${steamId}&relationship=friend`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return data?.friendslist?.friends ?? [];
  } catch (e) {
    logger.warn({ steamId, err: (e as Error).message }, 'getFriendList failed');
    return [];
  }
}

