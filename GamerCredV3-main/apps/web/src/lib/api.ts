export interface ApiUser {
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

export interface ApiGame {
  appid: number;
  name: string;
  hours: number;
  positivePct: number;
  reviewCount: number;
  cover: string;
}

export interface ApiTopGame {
  appId: number;
  name: string;
  positivePct: number;
  cover: string;
}

export interface ApiFriend {
  steamId: string;
  personaName: string;
  avatar: string;
  credScore: number;
}

export interface ApiDailyUser {
  steamId: string;
  personaName: string;
  avatar: string;
  country: string | null;
  totalHours: number;
  playtime24h: number;
  dailyCred: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-requested-with': 'steam-cred',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export const api = {
  me: () => call<{ user: ApiUser | null }>('/auth/me'),
  logout: () => call<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  stubLogin: () =>
    call<{ ok: boolean; user: ApiUser }>('/auth/stub-login', { method: 'POST' }),
  leaderboard: () => call<{ users: ApiUser[] }>('/leaderboard'),
  dailyLeaderboard: () => call<{ users: ApiDailyUser[] }>('/leaderboard/daily'),
  dailySpotlight: () => call<{ spotlight: ApiDailyUser | null }>('/spotlight/daily'),
  topGames: () => call<{ games: ApiTopGame[] }>('/games/top-rated'),
  profile: (steamId: string) => call<{ user: ApiUser; games: ApiGame[] }>(`/users/${steamId}`),
  search: (q: string) => call<{ results: ApiUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  friends: () => call<{ friends: ApiFriend[] }>('/friends'),
  addFriend: (steamId: string) =>
    call<{ ok: boolean }>('/friends', {
      method: 'POST',
      body: JSON.stringify({ steamId }),
    }),
  removeFriend: (steamId: string) =>
    call<{ ok: boolean }>(`/friends/${steamId}`, { method: 'DELETE' }),
};

/**
 * Open Steam OpenID in a popup. Resolves when the popup posts back or closes.
 */
export function startSteamLogin(): Promise<{ ok: boolean; steamId?: string; error?: string }> {
  return new Promise((resolve) => {
    const base = window.location.origin;
    const url = `/api/auth/steam?base=${encodeURIComponent(base)}`;
    const w = 800;
    const h = 620;
    const x = window.screenX + (window.outerWidth - w) / 2;
    const y = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      url,
      'steam-login',
      `width=${w},height=${h},left=${x},top=${y},resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      resolve({ ok: false, error: 'popup_blocked' });
      return;
    }
    let settled = false;
    const onMessage = (e: MessageEvent) => {
      // Verify the message came from OUR popup window, not some other frame/tab.
      // This works whether the popup is same-origin (Vite proxy) or cross-origin (split-host prod).
      if (e.source !== popup) return;
      if (!e.data || e.data.type !== 'steam-cred-auth') return;
      const payload = e.data.payload;
      if (!payload || typeof payload !== 'object') return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
      try { popup.close(); } catch {}
      resolve(payload);
    };
    window.addEventListener('message', onMessage);
    const timer = setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        window.removeEventListener('message', onMessage);
        clearInterval(timer);
        resolve({ ok: false, error: 'closed' });
      }
    }, 500);
  });
}
