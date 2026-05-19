import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Panel from '@/components/Panel';
import { LoadingScreen } from '@/components/Status';
import { formatCred } from '@/lib/utils';
import { UserPlus, UserMinus, Swords, Search } from 'lucide-react';

export default function FriendsPage() {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const meQ = useQuery({ queryKey: ['me'], queryFn: api.me });
  const me = meQ.data?.user;
  const friends = useQuery({ queryKey: ['friends'], queryFn: api.friends, enabled: !!me });

  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await api.search(q.trim());
      setResults(r.results ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function add(sid: string) {
    await api.addFriend(sid).catch(() => null);
    qc.invalidateQueries({ queryKey: ['friends'] });
  }
  async function remove(sid: string) {
    await api.removeFriend(sid).catch(() => null);
    qc.invalidateQueries({ queryKey: ['friends'] });
  }

  if (meQ.isLoading) return <LoadingScreen />;
  if (!me) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <Panel className="text-center">
          <h1 className="neon text-3xl uppercase">SIGN IN REQUIRED</h1>
          <p className="text-neonCyan/80 mt-2 uppercase">YOU NEED A STEAM ACCOUNT TO MANAGE FRIENDS.</p>
          <Link href="/login" className="btn-arcade mt-5 inline-block">CONNECT WITH STEAM</Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <h1 className="neon text-4xl uppercase">ALLIES & RIVALS</h1>

      <Panel>
        <div className="text-sm text-neonMagenta uppercase">// FIND OPERATORS</div>
        <form onSubmit={doSearch} className="flex gap-2 mt-2 max-w-xl">
          <div className="relative flex-1">
            <input
              className="input-arcade pr-10"
              placeholder="STEAM ID, VANITY URL, OR PERSONA NAME..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neonCyan/70 pointer-events-none" />
          </div>
          <button type="submit" className="btn-arcade" disabled={busy}>
            {busy ? 'SCANNING' : 'SEARCH'}
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {results.length === 0 && !busy && (
            <div className="text-neonCyan/50 text-sm uppercase">NO RESULTS YET.</div>
          )}
          {results.map((u) => (
            <div key={u.steamId} className="flex items-center justify-between gap-2 p-2 border border-neonCyan/20">
              <Link href={`/player/${u.steamId}`} className="flex items-center gap-2 min-w-0">
                {u.avatar && <img src={u.avatar} alt="" className="w-8 h-8 border border-neonCyan/40" />}
                <span className="truncate uppercase">{u.personaName}</span>
                <span className="text-xs text-neonMagenta">{formatCred(u.credScore)} CRED</span>
              </Link>
              {u.steamId !== me.steamId && (
                <button onClick={() => add(u.steamId)} className="btn-arcade text-sm">
                  <UserPlus size={14} /> ADD
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel variant="magenta">
        <div className="text-sm text-neonMagenta uppercase">// YOUR ALLIES</div>
        <h2 className="neon-mag text-2xl uppercase">FRIENDS LIST</h2>
        {friends.isLoading && <LoadingScreen />}
        {friends.data?.friends?.length === 0 && (
          <div className="text-neonCyan/60 text-base mt-2 uppercase">NO ALLIES YET. USE SEARCH ABOVE.</div>
        )}
        <div className="mt-3 space-y-2">
          {friends.data?.friends?.map((f) => (
            <div key={f.steamId} className="flex items-center justify-between gap-2 p-2 border border-neonMagenta/30">
              <Link href={`/player/${f.steamId}`} className="flex items-center gap-2 min-w-0">
                <img src={f.avatar} alt="" className="w-8 h-8 border border-neonMagenta/40" />
                <span className="truncate uppercase">{f.personaName}</span>
                <span className="text-xs text-neonYellow">{formatCred(f.credScore)} CRED</span>
              </Link>
              <div className="flex gap-2">
                <button onClick={() => nav(`/versus?a=${me.steamId}&b=${f.steamId}`)} className="btn-mag text-sm">
                  <Swords size={14} /> VS
                </button>
                <button onClick={() => remove(f.steamId)} className="btn-ghost text-sm">
                  <UserMinus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
