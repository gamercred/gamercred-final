import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Panel from '@/components/Panel';
import { LoadingScreen, ErrorScreen } from '@/components/Status';
import { formatCred, formatHours, cn } from '@/lib/utils';

function parseQuery(search: string) {
  const sp = new URLSearchParams(search);
  return { a: sp.get('a') ?? '', b: sp.get('b') ?? '' };
}

export default function VersusPage() {
  const [loc] = useLocation();
  // wouter's loc doesn't include search; pull from window
  const [{ a, b }, setIds] = useState(() => parseQuery(window.location.search));
  const [aIn, setAIn] = useState(a);
  const [bIn, setBIn] = useState(b);

  useEffect(() => {
    setIds(parseQuery(window.location.search));
  }, [loc]);

  const meQ = useQuery({ queryKey: ['me'], queryFn: api.me });
  const me = meQ.data?.user;
  // If signed in and no `a` given, default to current user
  const effectiveA = a || me?.steamId || '';

  const aQ = useQuery({
    queryKey: ['profile', effectiveA],
    queryFn: () => api.profile(effectiveA),
    enabled: /^\d{17}$/.test(effectiveA),
  });
  const bQ = useQuery({
    queryKey: ['profile', b],
    queryFn: () => api.profile(b),
    enabled: /^\d{17}$/.test(b),
  });

  function go(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (aIn) params.set('a', aIn.trim());
    if (bIn) params.set('b', bIn.trim());
    window.history.pushState({}, '', `/versus?${params.toString()}`);
    setIds(parseQuery(`?${params.toString()}`));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <h1 className="neon text-4xl uppercase">VERSUS MODE</h1>

      <Panel>
        <form onSubmit={go} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs uppercase text-neonMagenta">PLAYER A · STEAM ID</label>
            <input className="input-arcade" value={aIn} onChange={(e) => setAIn(e.target.value)} placeholder={me?.steamId ?? '76561198...'} />
          </div>
          <div>
            <label className="text-xs uppercase text-neonMagenta">PLAYER B · STEAM ID</label>
            <input className="input-arcade" value={bIn} onChange={(e) => setBIn(e.target.value)} placeholder="76561198..." />
          </div>
          <button type="submit" className="btn-arcade">COMPARE</button>
        </form>
      </Panel>

      {(aQ.isLoading || bQ.isLoading) && <LoadingScreen label="LOADING COMBATANTS" />}
      {(aQ.error || bQ.error) && (
        <ErrorScreen message={((aQ.error || bQ.error) as Error).message} />
      )}

      {aQ.data && bQ.data && (
        <ComparisonBlock a={aQ.data} b={bQ.data} />
      )}

      {!aQ.data && !bQ.data && !aQ.isLoading && !bQ.isLoading && (
        <Panel>
          <div className="text-center py-8 text-neonCyan/60 uppercase">
            ENTER TWO STEAM IDS ABOVE TO COMPARE.
          </div>
        </Panel>
      )}
    </div>
  );
}

function ComparisonBlock({ a, b }: { a: NonNullable<ReturnType<typeof api.profile> extends Promise<infer T> ? T : never>; b: typeof a }) {
  const rows = [
    { label: 'CRED', av: a.user.credScore, bv: b.user.credScore, fmt: formatCred },
    { label: 'GAMES', av: a.user.totalGames, bv: b.user.totalGames, fmt: (n: number) => n.toLocaleString() },
    { label: 'HOURS', av: a.user.totalHours, bv: b.user.totalHours, fmt: formatHours },
    { label: 'AVG RATING', av: a.user.avgRating, bv: b.user.avgRating, fmt: (n: number) => `${Math.round((n || 0) * 100)}%` },
  ];

  const aIds = new Set(a.games.map((g) => g.appid));
  const shared = b.games.filter((g) => aIds.has(g.appid)).slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4 items-stretch">
        <Panel className="text-center">
          <img src={a.user.avatar} alt="" className="w-20 h-20 mx-auto border border-neonCyan/60" />
          <div className="neon text-2xl uppercase mt-2">{a.user.personaName}</div>
        </Panel>
        <div className="flex items-center justify-center">
          <div className="neon-mag text-6xl animate-glowpulse">VS</div>
        </div>
        <Panel variant="magenta" className="text-center">
          <img src={b.user.avatar} alt="" className="w-20 h-20 mx-auto border border-neonMagenta/60" />
          <div className="neon-mag text-2xl uppercase mt-2">{b.user.personaName}</div>
        </Panel>
      </div>

      <Panel>
        <div className="space-y-2">
          {rows.map((r) => {
            const aWins = r.av > r.bv;
            const bWins = r.bv > r.av;
            return (
              <div key={r.label} className="grid grid-cols-3 items-center gap-2 border-b border-neonCyan/10 py-2">
                <div className={cn('text-right text-2xl', aWins ? 'neon' : 'text-neonCyan/60')}>
                  {r.fmt(r.av)}
                </div>
                <div className="text-center text-xs uppercase text-neonMagenta">{r.label}</div>
                <div className={cn('text-left text-2xl', bWins ? 'neon-mag' : 'text-neonCyan/60')}>
                  {r.fmt(r.bv)}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="text-sm text-neonMagenta uppercase">// SHARED TITLES</div>
        <h2 className="neon text-2xl uppercase">COMMON GROUND · {shared.length}</h2>
        {shared.length === 0 ? (
          <div className="text-neonCyan/60 text-base mt-2 uppercase">NO OVERLAP. WILDLY DIFFERENT TASTE.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-3">
            {shared.map((g) => (
              <div key={g.appid} className="game-card p-2">
                <img src={g.cover} alt="" className="w-full h-auto" loading="lazy" />
                <div className="text-sm uppercase truncate mt-1">{g.name}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
