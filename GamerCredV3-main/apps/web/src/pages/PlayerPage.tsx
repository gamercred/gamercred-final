import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Panel from '@/components/Panel';
import AffiliateBanner from '@/components/AffiliateBanner';
import { LoadingScreen, ErrorScreen } from '@/components/Status';
import { formatCred, formatHours, ratingColor, ratingLabel } from '@/lib/utils';
import { UserPlus, Swords } from 'lucide-react';

export default function PlayerPage({ params }: { params: { steamId: string } }) {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['me'], queryFn: api.me });
  const me = meQ.data?.user;
  const { data, isLoading, error } = useQuery({
    queryKey: ['profile', params.steamId],
    queryFn: () => api.profile(params.steamId),
  });

  if (isLoading) return <LoadingScreen label="SCANNING LIBRARY" />;
  if (error) return <ErrorScreen message={(error as Error).message} />;
  if (!data) return <ErrorScreen message="NO DATA" />;

  const u = data.user;
  const games = (data.games ?? [])
    .slice()
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 60);

  const isMe = me?.steamId === u.steamId;

  async function addFriend() {
    if (!me) {
      nav('/login');
      return;
    }
    await api.addFriend(u.steamId).catch(() => null);
    qc.invalidateQueries({ queryKey: ['friends'] });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header */}
      <Panel className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        {u.avatar && (
          <img src={u.avatar} alt="" className="w-24 h-24 border-2 border-neonCyan/70 shadow-[0_0_18px_hsl(180_100%_50%/0.4)]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-neonMagenta uppercase">// OPERATOR</div>
          <h1 className="neon text-4xl uppercase truncate">{u.personaName}</h1>
          <div className="text-neonCyan/70 text-base uppercase">
            STEAM ID: {u.steamId} {u.country && `· ${u.country}`}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm uppercase text-neonMagenta">// CRED</div>
          <div className="neon-mag text-6xl animate-glowpulse">{formatCred(u.credScore)}</div>
        </div>
        <div className="flex gap-2">
          {!isMe && (
            <>
              <button onClick={addFriend} className="btn-arcade" title="ADD FRIEND">
                <UserPlus size={16} /> ADD
              </button>
              <Link
                href={me ? `/versus?a=${me.steamId}&b=${u.steamId}` : `/versus?b=${u.steamId}`}
                className="btn-mag"
              >
                <Swords size={16} /> CHALLENGE
              </Link>
            </>
          )}
        </div>
      </Panel>

      {/* Stat boxes */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'TOTAL GAMES', value: u.totalGames.toLocaleString() },
          { label: 'TOTAL HOURS', value: formatHours(u.totalHours) },
          { label: 'AVG RATING', value: `${Math.round((u.avgRating || 0) * 100)}%` },
          { label: 'CRED SCORE', value: formatCred(u.credScore) },
        ].map((s) => (
          <Panel key={s.label} className="text-center">
            <div className="text-xs uppercase text-neonMagenta">{s.label}</div>
            <div className="neon text-3xl mt-1">{s.value}</div>
          </Panel>
        ))}
      </section>

      <AffiliateBanner />

      {/* Game grid */}
      <section>
        <h2 className="neon text-2xl uppercase mb-3">GAME LIBRARY · TOP {games.length}</h2>
        {games.length === 0 ? (
          <Panel>
            <div className="text-center py-8 text-neonCyan/60 uppercase">
              NO PUBLIC LIBRARY DATA. PROFILE MAY BE PRIVATE.
            </div>
          </Panel>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {games.map((g) => (
              <div key={g.appid} className="game-card p-2">
                <img src={g.cover} alt="" className="w-full h-auto" loading="lazy" />
                <div className="mt-2 text-sm uppercase truncate text-neonCyan/90" title={g.name}>
                  {g.name}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-neonCyan/60">{formatHours(g.hours)}</span>
                  <span className={`text-xs ${ratingColor(g.positivePct)}`}>
                    {g.reviewCount > 0 ? `${Math.round(g.positivePct * 100)}%` : '—'}
                  </span>
                </div>
                {g.reviewCount > 0 && (
                  <div className="text-[10px] text-neonMagenta/70 uppercase mt-0.5 truncate">
                    {ratingLabel(g.positivePct)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <AffiliateBanner />
    </div>
  );
}
