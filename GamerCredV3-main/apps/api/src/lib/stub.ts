/**
 * STUB MODE — realistic fake data so the UI can run with no Steam API key
 * and no Postgres. Activated by STUB_MODE=true in .env.
 *
 * Frontend sees the exact same shapes as production.
 */

export const STUB_MODE = process.env.STUB_MODE === 'true';

export interface StubGame {
  appid: number;
  name: string;
  hours: number;
  positivePct: number;
  reviewCount: number;
  cover: string;
}

export interface StubUser {
  steamId: string;
  personaName: string;
  avatar: string;
  profileUrl: string;
  country: string | null;
  credScore: number;
  totalGames: number;
  totalHours: number;
  avgRating: number;
  lastCalculatedAt: string | null;
}

function cover(appId: number) {
  return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_231x87.jpg`;
}

// A catalog of popular real Steam apps with plausible review ratings.
const CATALOG: { appid: number; name: string; positivePct: number; reviewCount: number }[] = [
  { appid: 105600, name: 'Terraria', positivePct: 0.97, reviewCount: 1_100_000 },
  { appid: 1145360, name: 'Hades', positivePct: 0.98, reviewCount: 280_000 },
  { appid: 730, name: 'Counter-Strike 2', positivePct: 0.86, reviewCount: 8_400_000 },
  { appid: 570, name: 'Dota 2', positivePct: 0.81, reviewCount: 2_500_000 },
  { appid: 1086940, name: "Baldur's Gate 3", positivePct: 0.96, reviewCount: 690_000 },
  { appid: 367520, name: 'Hollow Knight', positivePct: 0.97, reviewCount: 290_000 },
  { appid: 1245620, name: 'Elden Ring', positivePct: 0.93, reviewCount: 750_000 },
  { appid: 1326470, name: 'Sons Of The Forest', positivePct: 0.83, reviewCount: 320_000 },
  { appid: 413150, name: 'Stardew Valley', positivePct: 0.98, reviewCount: 750_000 },
  { appid: 632360, name: 'Risk of Rain 2', positivePct: 0.96, reviewCount: 120_000 },
  { appid: 1172470, name: 'Apex Legends', positivePct: 0.81, reviewCount: 1_400_000 },
  { appid: 1091500, name: 'Cyberpunk 2077', positivePct: 0.83, reviewCount: 730_000 },
  { appid: 271590, name: 'Grand Theft Auto V', positivePct: 0.86, reviewCount: 1_800_000 },
  { appid: 374320, name: 'Dark Souls III', positivePct: 0.94, reviewCount: 250_000 },
  { appid: 292030, name: 'The Witcher 3: Wild Hunt', positivePct: 0.97, reviewCount: 700_000 },
  { appid: 1888930, name: 'The Last Of Us Part I', positivePct: 0.75, reviewCount: 95_000 },
  { appid: 578080, name: 'PUBG: BATTLEGROUNDS', positivePct: 0.59, reviewCount: 2_400_000 },
  { appid: 252490, name: 'Rust', positivePct: 0.86, reviewCount: 970_000 },
  { appid: 322170, name: 'Geometry Dash', positivePct: 0.97, reviewCount: 1_000_000 },
  { appid: 304930, name: 'Unturned', positivePct: 0.9, reviewCount: 720_000 },
  { appid: 230410, name: 'Warframe', positivePct: 0.88, reviewCount: 540_000 },
  { appid: 1716740, name: 'Starfield', positivePct: 0.64, reviewCount: 130_000 },
  { appid: 1517290, name: 'Battlefield 2042', positivePct: 0.46, reviewCount: 220_000 },
  { appid: 1962660, name: 'Forza Horizon 5', positivePct: 0.78, reviewCount: 110_000 },
  { appid: 990080, name: 'Hogwarts Legacy', positivePct: 0.92, reviewCount: 220_000 },
  { appid: 1551360, name: 'Forza Horizon 5 Standard', positivePct: 0.81, reviewCount: 65_000 },
  { appid: 49520, name: 'Borderlands 2', positivePct: 0.96, reviewCount: 200_000 },
  { appid: 8930, name: "Sid Meier's Civilization V", positivePct: 0.96, reviewCount: 250_000 },
  { appid: 289070, name: "Sid Meier's Civilization VI", positivePct: 0.86, reviewCount: 270_000 },
  { appid: 4000, name: "Garry's Mod", positivePct: 0.96, reviewCount: 970_000 },
];

// Deterministic PRNG so the same steamId always yields the same library.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromSteamId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function buildStubLibrary(steamId: string): StubGame[] {
  const rng = mulberry32(seedFromSteamId(steamId));
  const count = 18 + Math.floor(rng() * 35); // 18-52 games
  const shuffled = [...CATALOG].sort(() => rng() - 0.5).slice(0, Math.min(count, CATALOG.length));
  return shuffled.map((g) => ({
    appid: g.appid,
    name: g.name,
    hours: Math.floor(rng() * 800) + Math.floor(rng() * 50),
    positivePct: g.positivePct,
    reviewCount: g.reviewCount,
    cover: cover(g.appid),
  }));
}

export function calcStubCred(games: StubGame[]) {
  const totalHours = games.reduce((a, g) => a + g.hours, 0);
  const avgRating = games.length > 0 ? games.reduce((a, g) => a + g.positivePct, 0) / games.length : 0;
  const cred = games.length * 10 + games.reduce((a, g) => a + g.positivePct * g.hours, 0);
  return { cred, totalHours, avgRating };
}

const PERSONAS = [
  'Pixel_Wraith', 'arcade_ghost', 'QuasarKid', 'NEON_DRIFT', 'CTRL_ALT_DEL',
  'frame_perfect', 'MidnightRider', 'crit_chance', 'GG_NORE', 'Console_Peasant',
  'rogue_lite', 'DPSCheck', 'finalformfox', 'crouch_jump', 'SaveScum',
  'BunnyHop', 'sniper_n00b', 'EZ_CLAP', 'gigachad420', 'aim_assist',
];

const COUNTRIES = ['IN', 'US', 'GB', 'DE', 'JP', 'BR', 'KR', 'CA', 'AU', 'SE'];

function fakeAvatar(steamId: string): string {
  // Use a stable placeholder avatar service; image is just a colored block.
  return `https://avatars.steamstatic.com/${steamId.slice(-12)}_full.jpg`;
}

// Pre-baked roster of stub users (deterministic).
function buildStubUser(seed: number): StubUser {
  const rng = mulberry32(seed);
  // Pad to 17 digits, prefix with 76561198 like real Steam IDs.
  const tail = String(seed * 9973 + 100_000_000).slice(0, 9);
  const steamId = `76561198${tail.padStart(9, '0')}`;
  const persona = PERSONAS[Math.floor(rng() * PERSONAS.length)];
  const games = buildStubLibrary(steamId);
  const { cred, totalHours, avgRating } = calcStubCred(games);
  return {
    steamId,
    personaName: persona,
    avatar: fakeAvatar(steamId),
    profileUrl: `https://steamcommunity.com/profiles/${steamId}/`,
    country: COUNTRIES[Math.floor(rng() * COUNTRIES.length)],
    credScore: cred,
    totalGames: games.length,
    totalHours,
    avgRating,
    lastCalculatedAt: new Date().toISOString(),
  };
}

let cachedRoster: StubUser[] | null = null;
export function stubRoster(): StubUser[] {
  if (cachedRoster) return cachedRoster;
  const arr: StubUser[] = [];
  for (let i = 1; i <= 14; i++) arr.push(buildStubUser(i * 1337));
  arr.sort((a, b) => b.credScore - a.credScore);
  cachedRoster = arr;
  return arr;
}

export function findStubUser(steamId: string): StubUser | null {
  const found = stubRoster().find((u) => u.steamId === steamId);
  if (found) return found;
  // Synthesize a user on demand so /player/<anything> works
  if (!/^\d{17}$/.test(steamId)) return null;
  const games = buildStubLibrary(steamId);
  const { cred, totalHours, avgRating } = calcStubCred(games);
  return {
    steamId,
    personaName: `operator_${steamId.slice(-4)}`,
    avatar: fakeAvatar(steamId),
    profileUrl: `https://steamcommunity.com/profiles/${steamId}/`,
    country: 'IN',
    credScore: cred,
    totalGames: games.length,
    totalHours,
    avgRating,
    lastCalculatedAt: new Date().toISOString(),
  };
}

export function topRatedStub() {
  return [...CATALOG]
    .filter((g) => g.reviewCount >= 1000)
    .sort((a, b) => b.positivePct - a.positivePct)
    .slice(0, 30)
    .map((g) => ({
      appId: g.appid,
      name: g.name,
      positivePct: g.positivePct,
      cover: cover(g.appid),
    }));
}
