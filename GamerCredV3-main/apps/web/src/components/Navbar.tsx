import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCred, cn } from '@/lib/utils';
import { LogOut, ExternalLink } from 'lucide-react';

// AFFILIATE: replace this URL with your real Green Man Gaming referral link
const GMG_AFFILIATE_URL = 'https://www.greenmangaming.com/';

const LINKS = [
  { to: '/', label: 'HOME' },
  { to: '/leaderboard', label: 'LEADERBOARD' },
  { to: '/versus', label: 'VERSUS' },
  { to: '/friends', label: 'FRIENDS' },
];

export default function Navbar() {
  const [loc] = useLocation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['me'], queryFn: api.me });
  const user = data?.user;

  return (
    <header className="relative z-10 border-b border-neonCyan/30 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <span className="neon text-3xl font-bold tracking-widest">GAMERCRED</span>
          <span className="neon-mag text-sm hidden md:inline">// V0.1</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => {
            const active = loc === l.to || (l.to !== '/' && loc.startsWith(l.to));
            return (
              <Link
                key={l.to}
                href={l.to}
                className={cn(
                  'px-3 py-1 text-base tracking-widest uppercase',
                  active ? 'neon' : 'text-neonCyan/70 hover:text-neonCyan'
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <a
            href={GMG_AFFILIATE_URL}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="ml-2 px-3 py-1 text-base tracking-widest uppercase flex items-center gap-1 neon-mag hover:text-neonMagenta transition-colors"
            title="Support us by shopping games via Green Man Gaming"
          >
            SUPPORT US
            <ExternalLink size={14} />
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link href={`/player/${user.steamId}`} className="flex items-center gap-2">
                {user.avatar && (
                  <img src={user.avatar} alt="" className="w-8 h-8 border border-neonCyan/60" />
                )}
                <div className="text-right leading-tight">
                  <div className="text-sm uppercase neon">{user.personaName}</div>
                  <div className="text-xs text-neonMagenta">CRED {formatCred(user.credScore)}</div>
                </div>
              </Link>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await api.logout();
                  qc.invalidateQueries({ queryKey: ['me'] });
                }}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-arcade">SIGN IN</Link>
          )}
        </div>
      </div>
    </header>
  );
}
