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

  // On page load, check if already logged in. If so, redirect to home.
  useEffect(() => {
    api.me().then((res) => {
      if (res.user) {
        window.location.href = `/player/${res.user.steamId}`;
      }
    }).catch(() => {});
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
      // Stub endpoint returns 404 in real mode — fall through to Steam OpenID.
    }

    // Real Steam OpenID popup flow.
    // We don't trust postMessage to fire reliably — we poll /api/auth/me instead.
    const loginPromise = startSteamLogin();

    // Poll for session every 1.5s. If we detect login, hard-navigate.
    const pollInterval = setInterval(async () => {
      try {
        const me = await api.me();
        if (me.user) {
          clearInterval(pollInterval);
          window.location.href = `/player/${me.user.steamId}`;
        }
      } catch {}
    }, 1500);

    // Stop polling after 2 minutes (user gave up)
    const stopTimer = setTimeout(() => clearInterval(pollInterval), 120_000);

    const res = await loginPromise;
    setBusy(false);

    if (res.ok) {
      // postMessage actually worked — great, redirect now
      clearInterval(pollInterval);
      clearTimeout(stopTimer);
      window.location.href = '/';
    } else {
      // Don't show error if polling will still catch it
      // Only show real errors after polling timeout
      if (res.error !== 'closed') {
        setErr(res.error ?? 'unknown');
      }
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
