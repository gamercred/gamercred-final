import { useQuery } from '@tanstack/react-query';
import { api, type ApiTopGame } from '@/lib/api';
import { ratingColor, ratingLabel } from '@/lib/utils';

const FALLBACK: ApiTopGame[] = [
  { appId: 413150, name: 'STARDEW VALLEY', positivePct: 0.98 },
  { appId: 1145360, name: 'HADES', positivePct: 0.98 },
  { appId: 322170, name: 'GEOMETRY DASH', positivePct: 0.97 },
  { appId: 105600, name: 'TERRARIA', positivePct: 0.97 },
  { appId: 367520, name: 'HOLLOW KNIGHT', positivePct: 0.97 },
  { appId: 292030, name: 'THE WITCHER 3', positivePct: 0.97 },
  { appId: 391540, name: 'UNDERTALE', positivePct: 0.97 },
  { appId: 1086940, name: "BALDUR'S GATE 3", positivePct: 0.96 },
  { appId: 632360, name: 'RISK OF RAIN 2', positivePct: 0.96 },
  { appId: 49520, name: 'BORDERLANDS 2', positivePct: 0.96 },
  { appId: 8930, name: 'CIVILIZATION V', positivePct: 0.96 },
  { appId: 4000, name: "GARRY'S MOD", positivePct: 0.96 },
  { appId: 250900, name: 'BINDING OF ISAAC', positivePct: 0.96 },
  { appId: 268910, name: 'CUPHEAD', positivePct: 0.96 },
  { appId: 1145350, name: 'HADES II', positivePct: 0.96 },
  { appId: 588650, name: 'DEAD CELLS', positivePct: 0.95 },
  { appId: 374320, name: 'DARK SOULS III', positivePct: 0.94 },
  { appId: 814380, name: 'SEKIRO', positivePct: 0.94 },
  { appId: 1888160, name: 'ARMORED CORE VI', positivePct: 0.94 },
  { appId: 1245620, name: 'ELDEN RING', positivePct: 0.93 },
  { appId: 990080, name: 'HOGWARTS LEGACY', positivePct: 0.92 },
  { appId: 1174180, name: 'RED DEAD REDEMPTION 2', positivePct: 0.91 },
  { appId: 230410, name: 'WARFRAME', positivePct: 0.88 },
  { appId: 730, name: 'COUNTER-STRIKE 2', positivePct: 0.86 },
  { appId: 271590, name: 'GTA V', positivePct: 0.86 },
  { appId: 289070, name: 'CIVILIZATION VI', positivePct: 0.86 },
  { appId: 252490, name: 'RUST', positivePct: 0.86 },
  { appId: 1326470, name: 'SONS OF THE FOREST', positivePct: 0.83 },
  { appId: 1091500, name: 'CYBERPUNK 2077', positivePct: 0.83 },
  { appId: 1172470, name: 'APEX LEGENDS', positivePct: 0.81 },
  { appId: 570, name: 'DOTA 2', positivePct: 0.81 },
].map((g) => ({
  ...g,
  cover: `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${g.appId}/capsule_231x87.jpg`,
}));

const steamUrl = (id: number) => `https://store.steampowered.com/app/${id}`;
const heroImg = (id: number) =>
  `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`;

export default function GameTicker() {
  const { data } = useQuery({ queryKey: ['topGames'], queryFn: api.topGames });
  const games = data?.games && data.games.length > 0 ? data.games : FALLBACK;
  const loop = [...games, ...games];

  return (
    <div className="relative border-y border-neonCyan/30 bg-bg/70 backdrop-blur">
      {/* The ticker-track itself overflows; the popup uses an overlay above this row */}
      <div className="overflow-x-hidden">
        <div className="ticker-track py-2">
          {loop.map((g, i) => (
            <a
              key={`${g.appId}-${i}`}
              href={steamUrl(g.appId)}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-center gap-3 px-6 whitespace-nowrap hover:bg-neonCyan/10 transition-colors"
              title={`Open ${g.name} on Steam`}
            >
              <img
                src={g.cover}
                alt=""
                className="h-10 w-auto border border-neonCyan/40"
                loading="lazy"
              />
              <span className="uppercase text-base text-neonCyan/90">{g.name}</span>
              <span className={`text-base ${ratingColor(g.positivePct)}`}>
                {Math.round(g.positivePct * 100)}%
              </span>
              <span className="text-neonMagenta/60">·</span>

            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
