import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { api, startSteamLogin } from '@/lib/api';
import Panel from '@/components/Panel';

export default function LoginPage() {
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // On mount AND every time window regains focus, check if we're logged in.
  // Window-focus fires when the Steam popup closes — catches login completion.
  useEffect(() => {
    const check = () => {
      api.me().then((res) => {
        if (res.user) {
          window.location.href = `/player/${res.user.steamId}`;
        }
      }).catch(() => {});
    };
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  async function go() {
    setBusy(true);
    setErr(null);

    // Try stub login first — succeeds only if API has STUB_MODE=true.
    try {
      const res = await api.stubLogin();
      if (res.ok) {
        window.location.href = `/player/${res.user.steamId}`;
        return;
      }
    } catch {
      // Stub returns 404 in real mode — fall through to Steam OpenID.
    }

    // Real Steam OpenID popup flow.
    const res = await startSteamLogin();
    setBusy(false);

    if (res.ok) {
      // postMessage worked — redirect now
      const me = await api.me().catch(() => null);
      if (me?.user) {
        window.location.href = `/player/${me.user.steamId}`;
      } else {
        window.location.href = '/';
      }
    } else if (res.error && res.error !== 'closed') {
      // Show real errors, but suppress 'closed' (focus listener will catch the login)
      setErr(res.error);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Panel className="text-center">
        <div className="text-sm text-neonMagenta uppercase">// AUTHENTICATION</div>
        <h1 className="neon text-4xl uppercase mt-2 animate-glowpulse">SIGN IN</h1>
        <p className="text-neonCyan/80 mt-3 text-base uppercase">
          CONNECT YOUR STEAM ACCOUNT TO BANK YOUR CRED &amp; ADD FRIENDS.
        </p>
        <button onClick={go} disabled={busy} className="btn-arcade mt-6 mx-auto">
          {busy ? 'CONNECTING...' : 'CONNECT WITH STEAM'}
        </button>
        {err && (
          <div className="mt-4 neon-mag text-sm uppercase">
            CRITICAL ERROR: {err}. RETRY CONNECTION.
          </div>
        )}
        <p className="text-xs text-neonCyan/50 mt-6 uppercase">
          WE USE STEAM OPENID. WE NEVER SEE YOUR PASSWORD.
        </p>
      </Panel>
    </div>
  );
}
