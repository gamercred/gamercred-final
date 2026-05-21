import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'wouter';
import { api } from '@/lib/api';
import Panel from '@/components/Panel';
import GameTicker from '@/components/GameTicker';
import AffiliateBanner, { AffiliateRowFull } from '@/components/AffiliateBanner';
import { LoadingScreen, ErrorScreen } from '@/components/Status';
import { formatCred, formatHours } from '@/lib/utils';
import { Search } from 'lucide-react';

export default function HomePage() {
  const [, nav] = useLocation();
  const [q, setQ] = useState('');
  const { data: meData } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const me = meData?.user;
  const lb = useQuery({ queryKey: ['leaderboard'], queryFn: api.leaderboard });
  const dailyLb = useQuery({ queryKey: ['dailyLeaderboard'], queryFn: api.dailyLeaderboard });
  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: api.friends,
    enabled: !!me,
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    if (/^\d{17}$/.test(v)) {
      nav(`/player/${v}`);
    } else {
      nav(`/leaderboard?q=${encodeURIComponent(v)}`);
    }
  }

  const top = lb.data?.users?.slice(0, 5) ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <GameTicker />

      {/* Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2">
          <div className="text-sm text-neonMagenta uppercase">// SYSTEM ONLINE</div>
          <h1 className="neon text-5xl md:text-6xl font-bold uppercase mt-1 animate-glowpulse">
            GAMING CREDIT SCORE
          </h1>
          <p className="text-neonCyan/80 mt-3 max-w-2xl">
            CONNECT STEAM. WE SCAN YOUR LIBRARY. WE WEIGH YOUR HOURS BY THE REVIEW RATING
            OF EVERY GAME YOU PLAY. YOU GET A <span className="neon-mag">CRED</span> SCORE.
            COMPETE GLOBALLY.
          </p>
          <div className="mt-4 panel panel-mag p-3 inline-block">
            <span className="corner-tl" /><span className="corner-tr" />
            <span className="corner-bl" /><span className="corner-br" />
            <code className="text-neonYellow text-lg">
              CRED = (GAMES × 10) + Σ (RATING × HOURS)
            </code>
          </div>

          {/* Search */}
          <form onSubmit={onSubmit} className="mt-6 flex gap-2 max-w-xl">
            <div className="relative flex-1">
              <input
                className="input-arcade pr-10"
                placeholder="ENTER STEAM ID OR VANITY URL..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neonCyan/70 pointer-events-none" />
            </div>
            <button type="submit" className="btn-arcade">SCAN</button>
          </form>

          {!me && (
            <div className="mt-4 flex gap-3">
              <Link href="/login" className="btn-arcade">SIGN IN</Link>
              <Link href="/leaderboard" className="btn-ghost">VIEW LEADERBOARD</Link>
            </div>
          )}
        </Panel>

        {/* Friends or guest CTA */}
        {me ? (
          <Panel variant="magenta">
            <div className="text-sm text-neonMagenta uppercase">// ALLIES</div>
            <div className="neon-mag text-2xl uppercase">FRIENDS LIST</div>
            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {friends.isLoading && <div className="text-neonCyan/60 text-sm">LOADING...</div>}
              {friends.data?.friends?.length === 0 && (
                <div className="text-neonCyan/60 text-sm">
                  NO ALLIES YET. <Link href="/friends" className="underline">FIND SOME</Link>.
                </div>
              )}
              {friends.data?.friends?.map((f) => (
                <Link
                  key={f.steamId}
                  href={`/player/${f.steamId}`}
                  className="flex items-center justify-between gap-2 p-2 border border-neonMagenta/30 hover:border-neonMagenta/70"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={f.avatar} alt="" className="w-7 h-7 border border-neonMagenta/40" />
                    <span className="truncate text-base">{f.personaName}</span>
                  </div>
                  <span className="text-neonYellow text-sm">{formatCred(f.credScore)}</span>
                </Link>
              ))}
            </div>
            <Link href="/friends" className="btn-ghost mt-3 inline-block">MANAGE</Link>
          </Panel>
        ) : (
          <Panel variant="magenta">
            <div className="text-sm text-neonMagenta uppercase">// GUEST MODE</div>
            <div className="neon-mag text-2xl uppercase">SIGN IN TO TRACK</div>
            <p className="text-neonCyan/80 mt-2 text-base">
              GUESTS CAN BROWSE EVERYTHING. SIGN IN TO ADD FRIENDS &amp; SAVE YOUR PROFILE
              TO THE GLOBAL LEADERBOARD.
            </p>
            <Link href="/login" className="btn-mag mt-4 inline-block">CONNECT WITH STEAM</Link>
          </Panel>
        )}
      </section>

      {/* Leaderboard preview */}
      <section>
        <div className="flex items-end justify-between mb-2">
          <h2 className="neon text-3xl uppercase">TOP OPERATORS</h2>
          <Link href="/leaderboard" className="btn-ghost">VIEW ALL &rarr;</Link>
        </div>
        {lb.isLoading && <LoadingScreen />}
        {lb.error && <ErrorScreen message={(lb.error as Error).message} />}
        {top.length > 0 && (
          <Panel>
            <div className="grid grid-cols-12 gap-2 text-xs uppercase text-neonCyan/60 border-b border-neonCyan/20 pb-2 mb-2">
              <div className="col-span-1">#</div>
              <div className="col-span-5">PLAYER</div>
              <div className="col-span-2 text-right">CRED</div>
              <div className="col-span-2 text-right">GAMES</div>
              <div className="col-span-2 text-right">HOURS</div>
            </div>
            {top.map((u, i) => (
              <Link
                key={u.steamId}
                href={`/player/${u.steamId}`}
                className="grid grid-cols-12 gap-2 items-center py-2 hover:bg-neonCyan/5 px-1"
              >
                <div className="col-span-1 neon-yel text-xl">{i + 1}</div>
                <div className="col-span-5 flex items-center gap-2 min-w-0">
                  {u.avatar && <img src={u.avatar} alt="" className="w-8 h-8 border border-neonCyan/40" />}
                  <span className="truncate uppercase">{u.personaName}</span>
                </div>
                <div className="col-span-2 text-right neon">{formatCred(u.credScore)}</div>
                <div className="col-span-2 text-right text-neonCyan/80">{u.totalGames}</div>
                <div className="col-span-2 text-right text-neonCyan/80">{formatHours(u.totalHours)}</div>
              </Link>
            ))}
          </Panel>
        )}
        {!lb.isLoading && top.length === 0 && (
          <Panel>
            <div className="text-center py-8 text-neonCyan/60">
              NO OPERATORS REGISTERED. BE THE FIRST — <Link href="/login" className="underline neon">CONNECT WITH STEAM</Link>.
            </div>
          </Panel>
        )}
      </section>

      {/* Daily Leaderboard preview */}
      <section>
        <div className="flex items-end justify-between mb-2">
          <h2 className="neon-mag text-3xl uppercase">DAILY TOP GUNS</h2>
          <span className="text-xs text-neonMagenta/80 uppercase tracking-widest">// PAST 24 HOURS CRED GAIN</span>
        </div>
        {dailyLb.isLoading && <LoadingScreen />}
        {dailyLb.error && <ErrorScreen message={(dailyLb.error as Error).message} />}
        {dailyLb.data?.users && (
          <Panel variant="magenta">
            <div className="grid grid-cols-12 gap-2 text-xs uppercase text-neonMagenta/60 border-b border-neonMagenta/20 pb-2 mb-2">
              <div className="col-span-1">#</div>
              <div className="col-span-5">PLAYER</div>
              <div className="col-span-2 text-right">DAILY CRED</div>
              <div className="col-span-2 text-right">24H PLAYTIME</div>
              <div className="col-span-2 text-right">TOTAL HOURS</div>
            </div>
            {dailyLb.data.users.slice(0, 5).map((u, i) => (
              <Link
                key={u.steamId}
                href={`/player/${u.steamId}`}
                className="grid grid-cols-12 gap-2 items-center py-2 hover:bg-neonMagenta/5 px-1"
              >
                <div className="col-span-1 neon-yel text-xl">{i + 1}</div>
                <div className="col-span-5 flex items-center gap-2 min-w-0">
                  {u.avatar && <img src={u.avatar} alt="" className="w-8 h-8 border border-neonMagenta/40" />}
                  <span className="truncate uppercase">{u.personaName}</span>
                </div>
                <div className="col-span-2 text-right neon-mag">+{formatCred(u.dailyCred)}</div>
                <div className="col-span-2 text-right text-neonCyan/80">{formatHours(u.playtime24h)}</div>
                <div className="col-span-2 text-right text-neonCyan/80">{formatHours(u.totalHours)}</div>
              </Link>
            ))}
            {dailyLb.data.users.length === 0 && (
              <div className="text-center py-8 text-neonMagenta/60 uppercase">
                NO RECENT TRAINING RECORDED YET. GET SOME PLAYTIME TO CLAIM THE SPOTLIGHT!
              </div>
            )}
          </Panel>
        )}
      </section>

      {/* Affiliate */}
      <AffiliateRowFull />

      <footer className="text-center text-xs text-neonCyan/40 uppercase py-4">
        GAMERCRED // BUILT FOR GAMERS. STEAM IS A TRADEMARK OF VALVE.
        AFFILIATE LINKS HELP KEEP THIS RUNNING.
      </footer>
    </div>
  );
}
