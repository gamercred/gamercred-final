import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Panel from '@/components/Panel';
import { LoadingScreen, ErrorScreen } from '@/components/Status';
import { formatCred, formatHours, cn } from '@/lib/utils';

export default function LeaderboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['leaderboard'], queryFn: api.leaderboard });

  if (isLoading) return <LoadingScreen label="LOADING LEADERBOARD" />;
  if (error) return <ErrorScreen message={(error as Error).message} />;

  const users = data?.users ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="neon text-4xl uppercase mb-4">GLOBAL LEADERBOARD</h1>
      <Panel>
        <div className="grid grid-cols-12 gap-2 text-xs uppercase text-neonCyan/60 border-b border-neonCyan/20 pb-2 mb-2">
          <div className="col-span-1">#</div>
          <div className="col-span-4">PLAYER</div>
          <div className="col-span-2 text-right">CRED</div>
          <div className="col-span-1 text-right">GAMES</div>
          <div className="col-span-2 text-right">HOURS</div>
          <div className="col-span-2 text-right">AVG RATING</div>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12 text-neonCyan/60 uppercase">
            NO OPERATORS REGISTERED YET. <Link href="/login" className="underline neon">BE THE FIRST</Link>.
          </div>
        )}

        {users.map((u, i) => {
          const top3 = i < 3;
          return (
            <Link
              key={u.steamId}
              href={`/player/${u.steamId}`}
              className={cn(
                'grid grid-cols-12 gap-2 items-center py-2 px-1 hover:bg-neonCyan/5 border-b border-neonCyan/10',
                top3 && 'bg-neonMagenta/5'
              )}
            >
              <div className={cn('col-span-1 text-2xl', top3 ? 'neon-yel' : 'text-neonCyan/80')}>
                {i + 1}
              </div>
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                {u.avatar && <img src={u.avatar} alt="" className="w-9 h-9 border border-neonCyan/40" />}
                <span className="truncate uppercase">{u.personaName}</span>
              </div>
              <div className="col-span-2 text-right neon text-lg">{formatCred(u.credScore)}</div>
              <div className="col-span-1 text-right text-neonCyan/80">{u.totalGames}</div>
              <div className="col-span-2 text-right text-neonCyan/80">{formatHours(u.totalHours)}</div>
              <div className="col-span-2 text-right text-neonMagenta">
                {Math.round((u.avgRating || 0) * 100)}%
              </div>
            </Link>
          );
        })}
      </Panel>
    </div>
  );
}
