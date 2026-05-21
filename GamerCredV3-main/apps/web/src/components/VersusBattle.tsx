import { useState, useEffect, useRef, useCallback } from 'react';
import type { ApiUser, ApiGame } from '@/lib/api';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════
   BATTLE SFX — procedural 8-bit sounds via Web Audio
   ═══════════════════════════════════════════════ */

class BattleSFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  private ensureCtx() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return { ctx: this.ctx, master: this.master! };
  }

  /** Sword slash — short square wave sweep down */
  hit() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.12);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.16);
    // Add a short noise burst for impact feel
    this.noiseBurst(t, 0.06, 0.15);
  }

  /** Shield deflect — high-pitched metallic ping */
  miss() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  /** Explosive critical hit — layered noise + low boom + high sweep */
  crit() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    // Low boom
    const boom = ctx.createOscillator();
    const bg = ctx.createGain();
    boom.type = 'sawtooth';
    boom.frequency.setValueAtTime(150, t);
    boom.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    bg.gain.setValueAtTime(0.4, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    boom.connect(bg);
    bg.connect(master);
    boom.start(t);
    boom.stop(t + 0.36);
    // High sweep
    const sweep = ctx.createOscillator();
    const sg = ctx.createGain();
    sweep.type = 'square';
    sweep.frequency.setValueAtTime(1600, t);
    sweep.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    sg.gain.setValueAtTime(0.25, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    sweep.connect(sg);
    sg.connect(master);
    sweep.start(t);
    sweep.stop(t + 0.21);
    // Impact noise
    this.noiseBurst(t, 0.12, 0.3);
  }

  /** K.O. fanfare — ascending arpeggio */
  ko() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      const start = t + i * 0.12;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  /** Parry success fanfare — rapid rising triangle wave arpeggio */
  parry() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const notes = [1046.5, 1318.51, 1567.98, 2093.0]; // C6 E6 G6 C7
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const start = t + i * 0.05;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 0.13);
    });
  }

  /** Tactile click/ping sound — rapid high-pitched double beep */
  ping() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const notes = [1500, 1800];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const start = t + i * 0.05;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 0.11);
    });
  }

  private noiseBurst(time: number, dur: number, vol: number) {
    const { ctx, master } = this.ensureCtx();
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(time);
    src.stop(time + dur + 0.01);
  }

  destroy() {
    this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}

// Singleton for battle sounds
const sfx = new BattleSFX();

/* ═══════════════════════════════════════════════
   STAT MAPPING — Steam data → RPG attributes
   ═══════════════════════════════════════════════ */

interface BattleStats {
  atk: number;  // from totalGames
  hp: number;   // from totalHours
  maxHp: number;
  def: number;  // from avgRating (0–100)
  spd: number;  // from credScore
}

function mapStats(user: ApiUser): BattleStats {
  const atk = Math.min(999, Math.round((user.totalGames || 1) * 0.3));
  const hp = Math.max(100, Math.min(9999, Math.round((user.totalHours || 50) * 0.5)));
  const def = Math.min(100, Math.round((user.avgRating || 0) * 100));
  const spd = Math.min(100, Math.max(1, Math.round((user.credScore || 10) * 0.01)));
  return { atk, hp, maxHp: hp, def, spd };
}

/* ═══════════════════════════════════════════════
   BATTLE ENGINE — pre-compute all turns
   ═══════════════════════════════════════════════ */

type TurnResult = {
  attacker: 'a' | 'b';
  type: 'hit' | 'crit' | 'miss';
  damage: number;
  aHpAfter: number;
  bHpAfter: number;
  message: string;
  weaponGame?: { appid: number; name: string; cover: string };
  parryable?: boolean;
  parryGame?: { appid: number; name: string; cover: string };
  isParried?: boolean;
  isParryFailed?: boolean;
};

function computeBattle(
  aUser: ApiUser,
  bUser: ApiUser,
  aGames: ApiGame[],
  bGames: ApiGame[]
): { turns: TurnResult[]; aStats: BattleStats; bStats: BattleStats; winner: 'a' | 'b' } {
  const aStats = mapStats(aUser);
  const bStats = mapStats(bUser);

  let aHp = aStats.maxHp;
  let bHp = bStats.maxHp;
  const turns: TurnResult[] = [];

  const getTopPool = (games: ApiGame[], size: number) => {
    return [...(games || [])]
      .sort((g1, g2) => (g2.positivePct || 0) - (g1.positivePct || 0))
      .slice(0, size);
  };

  const aTop10 = getTopPool(aGames, 10);
  const bTop10 = getTopPool(bGames, 10);
  const aTop20 = getTopPool(aGames, 20);
  const bTop20 = getTopPool(bGames, 20);

  // Determine who goes first by speed
  let firstAttacker: 'a' | 'b';
  if (aStats.spd > bStats.spd) firstAttacker = 'a';
  else if (bStats.spd > aStats.spd) firstAttacker = 'b';
  else firstAttacker = Math.random() < 0.5 ? 'a' : 'b';

  let current: 'a' | 'b' = firstAttacker;
  const maxRounds = 200; // safety limit

  for (let i = 0; i < maxRounds && aHp > 0 && bHp > 0; i++) {
    const attackerStats = current === 'a' ? aStats : bStats;
    const defenderStats = current === 'a' ? bStats : aStats;
    const attackerName = current === 'a' ? aUser.personaName : bUser.personaName;
    const defenderName = current === 'a' ? bUser.personaName : aUser.personaName;

    const missRoll = Math.random();
    if (missRoll < 0.10) {
      // Miss!
      turns.push({
        attacker: current,
        type: 'miss',
        damage: 0,
        aHpAfter: aHp,
        bHpAfter: bHp,
        message: `${attackerName} attacks... MISS!`,
      });
    } else {
      const critRoll = Math.random();
      const isCrit = critRoll < 0.15;
      const variance = 0.8 + Math.random() * 0.4; // 0.8–1.2
      const defReduction = 1 - defenderStats.def / 200;
      let damage = Math.round(attackerStats.atk * defReduction * variance * 1.2);
      if (isCrit) damage = Math.round(damage * 1.5);
      // Desperation: defender below 40% HP takes 1.8× damage
      const defenderHp = current === 'a' ? bHp : aHp;
      const defenderMaxHp = defenderStats.hp;
      if (defenderHp < defenderMaxHp * 0.4) {
        damage = Math.round(damage * 1.8);
      }
      damage = Math.max(1, damage); // minimum 1 damage

      if (current === 'a') {
        bHp = Math.max(0, bHp - damage);
      } else {
        aHp = Math.max(0, aHp - damage);
      }

      // Feature 1: Crit Weapon Game Selection
      let weaponGame: TurnResult['weaponGame'] = undefined;
      if (isCrit) {
        const attackerTop10 = current === 'a' ? aTop10 : bTop10;
        if (attackerTop10.length > 0) {
          const randGame = attackerTop10[Math.floor(Math.random() * attackerTop10.length)];
          weaponGame = { appid: randGame.appid, name: randGame.name, cover: randGame.cover };
        }
      }

      // Feature 2a: Parryable tags
      let parryable = false;
      let parryGame: TurnResult['parryGame'] = undefined;
      const defenderGamesList = current === 'a' ? bGames : aGames;
      const defenderTop20 = current === 'a' ? bTop20 : aTop20;

      if (defenderGamesList && defenderGamesList.length > 0) {
        const parryRoll = Math.random();
        if (isCrit) {
          parryable = parryRoll < 0.50;
        } else {
          parryable = parryRoll < 0.30;
        }

        if (parryable && defenderTop20.length > 0) {
          const randGame = defenderTop20[Math.floor(Math.random() * defenderTop20.length)];
          parryGame = { appid: randGame.appid, name: randGame.name, cover: randGame.cover };
        } else {
          parryable = false; // reset to false if no games available to pick from
        }
      }

      const critTag = isCrit ? ' CRITICAL HIT!' : '';
      turns.push({
        attacker: current,
        type: isCrit ? 'crit' : 'hit',
        damage,
        aHpAfter: aHp,
        bHpAfter: bHp,
        message: `${attackerName} deals ${damage} DMG to ${defenderName}!${critTag}`,
        weaponGame,
        parryable,
        parryGame,
      });
    }

    // Swap attacker
    current = current === 'a' ? 'b' : 'a';
  }

  const winner: 'a' | 'b' = bHp <= 0 ? 'a' : 'b';
  return { turns, aStats, bStats, winner };
}

/* ═══════════════════════════════════════════════
   PARRY CHALLENGE COMPONENT (QTE)
   ═══════════════════════════════════════════════ */

interface ParryChallengeProps {
  defenderGames: ApiGame[];
  attackerGames: ApiGame[];
  correctGame: { appid: number; name: string; cover: string };
  onParry: () => void;
  onFail: () => void;
  timeMs?: number;
}

// Fallback pool of recognizable games for decoys when attacker library is too small
const FALLBACK_DECOYS = [
  { appid: 413150, name: 'STARDEW VALLEY', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg' },
  { appid: 1145360, name: 'HADES', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg' },
  { appid: 322170, name: 'GEOMETRY DASH', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/322170/header.jpg' },
  { appid: 105600, name: 'TERRARIA', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/105600/header.jpg' },
  { appid: 367520, name: 'HOLLOW KNIGHT', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/367520/header.jpg' },
  { appid: 292030, name: 'THE WITCHER 3', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg' },
  { appid: 391540, name: 'UNDERTALE', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/391540/header.jpg' },
  { appid: 1245620, name: 'ELDEN RING', cover: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg' }
];

function ParryChallenge({
  defenderGames,
  attackerGames,
  correctGame,
  onParry,
  onFail,
  timeMs = 3000,
}: ParryChallengeProps) {
  const [shuffledCards, setShuffledCards] = useState<Array<{ appid: number; name: string; cover: string }>>([]);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [barWidth, setBarWidth] = useState(100);

  // Initialize the challenge cards
  useEffect(() => {
    const correct = { ...correctGame };
    
    // Pick decoys from attacker games that are NOT in the defender's library
    const defenderAppIds = new Set(defenderGames.map((g) => g.appid));
    const potentialDecoys = (attackerGames || []).filter(
      (g) => g.appid !== correctGame.appid && !defenderAppIds.has(g.appid)
    );

    // Get 3 unique decoys
    const decoys: Array<{ appid: number; name: string; cover: string }> = [];
    const usedAppIds = new Set<number>();

    // Try to get decoys from the potential pool
    const poolCopy = [...potentialDecoys];
    while (decoys.length < 3 && poolCopy.length > 0) {
      const idx = Math.floor(Math.random() * poolCopy.length);
      const game = poolCopy.splice(idx, 1)[0];
      if (!usedAppIds.has(game.appid)) {
        decoys.push({ appid: game.appid, name: game.name, cover: game.cover });
        usedAppIds.add(game.appid);
      }
    }

    // Fill remaining QTE slots with fallback decoys if needed
    let fallbackIdx = 0;
    while (decoys.length < 3 && fallbackIdx < FALLBACK_DECOYS.length) {
      const fGame = FALLBACK_DECOYS[fallbackIdx++];
      if (fGame.appid !== correctGame.appid && !defenderAppIds.has(fGame.appid) && !usedAppIds.has(fGame.appid)) {
        decoys.push(fGame);
        usedAppIds.add(fGame.appid);
      }
    }

    // Shuffle them
    const allCards = [correct, ...decoys];
    const shuffled = [...allCards].sort(() => Math.random() - 0.5);
    setShuffledCards(shuffled);

    // Start visual timer bar depletion
    const start = Date.now();
    const timerInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / timeMs) * 100);
      setBarWidth(pct);
      if (elapsed >= timeMs) {
        clearInterval(timerInterval);
      }
    }, 16);

    // Timeout trigger
    const timeout = setTimeout(() => {
      if (!resolved) {
        setResolved(true);
        setTimedOut(true);
        onFail();
      }
    }, timeMs);

    return () => {
      clearInterval(timerInterval);
      clearTimeout(timeout);
    };
  }, [correctGame, defenderGames, attackerGames, timeMs]);

  const handleCardClick = (appid: number) => {
    if (resolved || selectedAppId !== null) return;

    setSelectedAppId(appid);
    setResolved(true);

    if (appid === correctGame.appid) {
      // Success!
      setTimeout(() => {
        onParry();
      }, 600);
    } else {
      // Failure!
      setTimeout(() => {
        onFail();
      }, 600);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 my-2 border border-neonYellow/40 bg-bg/90 rounded-sm relative shadow-lg">
      <div className="text-center mb-2">
        <h3 className="neon-yel text-xl md:text-2xl uppercase font-bold animate-glowpulse">
          ⚡ INCOMING! PARRY NOW! ⚡
        </h3>
        <p className="text-xs text-neonCyan/60 uppercase tracking-widest mt-1">
          FIND AND CLICK DEFENDER'S GAME: <span className="text-neonCyan font-bold">{correctGame.name}</span>
        </p>
      </div>

      {/* Countdown Timer Bar */}
      <div className="w-full h-3 bg-bg border border-neonCyan/20 mb-4 overflow-hidden relative">
        <div
          className="h-full bg-neonCyan transition-all duration-75"
          style={{
            width: `${barWidth}%`,
            boxShadow: '0 0 8px hsl(180 100% 50%)',
          }}
        />
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-4 gap-2">
        {shuffledCards.map((card) => {
          const isSelected = selectedAppId === card.appid;
          const isCorrect = card.appid === correctGame.appid;
          
          let cardStatusClass = '';
          if (resolved) {
            if (isCorrect) {
              cardStatusClass = 'ring-2 ring-green-400 scale-105 border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]';
            } else if (isSelected && !isCorrect) {
              cardStatusClass = 'ring-2 ring-red-500 border-red-500 shake shadow-[0_0_12px_rgba(239,68,68,0.5)]';
            } else {
              cardStatusClass = 'opacity-40 scale-95';
            }
          }

          return (
            <button
              key={card.appid}
              disabled={resolved}
              onClick={() => handleCardClick(card.appid)}
              className={cn(
                'game-card p-1.5 flex flex-col items-center gap-1 rounded-sm text-center relative focus:outline-none select-none',
                'hover:scale-105 transition-transform duration-200 cursor-pointer disabled:cursor-not-allowed',
                cardStatusClass
              )}
            >
              <img
                src={card.cover}
                alt=""
                className="w-12 h-12 object-cover border border-neonCyan/20"
                draggable={false}
              />
              <div className="text-[10px] uppercase truncate w-full text-neonCyan/80 mt-0.5 leading-none">
                {card.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* QTE Status Overlay */}
      {resolved && (
        <div className="absolute inset-0 bg-bg/70 flex items-center justify-center pointer-events-none rounded-sm">
          <div className="text-center animate-glowpulse">
            {selectedAppId === correctGame.appid ? (
              <span className="text-green-400 text-2xl font-bold uppercase tracking-wider block drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]">
                PARRIED! -50% DMG
              </span>
            ) : timedOut ? (
              <span className="text-red-500 text-2xl font-bold uppercase tracking-wider block drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-bounce">
                TOO SLOW!
              </span>
            ) : (
              <span className="text-red-500 text-2xl font-bold uppercase tracking-wider block drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
                MISS! FULL DMG
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DAMAGE POPUP COMPONENT
   ═══════════════════════════════════════════════ */

interface DmgPopup {
  id: number;
  side: 'a' | 'b';
  type: 'hit' | 'crit' | 'miss';
  damage: number;
  weaponGame?: { appid: number; name: string; cover: string };
}

function DamagePopups({ popups }: { popups: DmgPopup[] }) {
  return (
    <>
      {popups.map((p) => {
        const isLeft = p.side === 'b'; // damage shows on target side
        const style: React.CSSProperties = {
          left: isLeft ? '18%' : '68%',
          top: `${20 + Math.random() * 10}%`,
          color:
            p.type === 'miss'
              ? 'hsl(0 0% 50%)'
              : p.type === 'crit'
              ? 'hsl(55 100% 70%)'
              : p.side === 'a'
              ? 'hsl(320 100% 70%)'
              : 'hsl(180 100% 70%)',
        };
        return (
          <div
            key={p.id}
            className={cn(
              'dmg-pop flex flex-col items-center gap-1',
              p.type === 'crit' && 'dmg-pop--crit',
              p.type === 'miss' && 'dmg-pop--miss'
            )}
            style={style}
          >
            {p.type === 'crit' && p.weaponGame && (
              <img
                src={p.weaponGame.cover}
                alt=""
                className="w-8 h-8 rounded-sm object-cover border border-neonYellow/40 animate-crit-weapon shadow-[0_0_8px_rgba(250,204,21,0.4)]"
              />
            )}
            <div>
              {p.type === 'miss'
                ? 'MISS'
                : p.type === 'crit'
                ? p.weaponGame
                  ? `⚡ ${p.weaponGame.name} — ${p.damage} DMG ⚡`
                  : `⚡ ${p.damage} ⚡`
                : `-${p.damage}`}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════
   HP BAR COMPONENT
   ═══════════════════════════════════════════════ */

function HpBar({
  current,
  max,
  variant,
}: {
  current: number;
  max: number;
  variant: 'cyan' | 'mag';
}) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const low = pct < 25;
  return (
    <div className={cn('hp-bar', variant === 'mag' && 'hp-bar--mag')}>
      <div
        className={cn(
          'hp-fill',
          variant === 'cyan' ? 'hp-fill--cyan' : 'hp-fill--mag',
          low && 'hp-fill--low'
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PLAYER BATTLE CARD
   ═══════════════════════════════════════════════ */

function PlayerBattleCard({
  user,
  stats,
  hp,
  variant,
  isWinner,
  isKo,
}: {
  user: ApiUser;
  stats: BattleStats;
  hp: number;
  variant: 'cyan' | 'mag';
  isWinner: boolean;
  isKo: boolean;
}) {
  const isCyan = variant === 'cyan';
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-4 w-full max-w-[260px]',
        'border rounded-sm transition-all duration-300',
        isCyan
          ? 'border-neonCyan/40 bg-neonCyan/5'
          : 'border-neonMagenta/40 bg-neonMagenta/5',
        isKo && 'opacity-40 grayscale',
        isWinner && 'ring-2 ring-offset-2 ring-offset-transparent',
        isWinner && isCyan && 'ring-neonCyan/60',
        isWinner && !isCyan && 'ring-neonMagenta/60'
      )}
    >
      {/* Avatar */}
      <img
        src={user.avatar}
        alt=""
        className={cn(
          'w-16 h-16 border-2',
          isCyan ? 'border-neonCyan/60' : 'border-neonMagenta/60',
          isKo && 'rotate-12'
        )}
      />

      {/* Name */}
      <div
        className={cn(
          'text-lg uppercase truncate max-w-full',
          isCyan ? 'neon' : 'neon-mag',
          isWinner && 'winner-text'
        )}
      >
        {user.personaName}
      </div>

      {/* HP */}
      <div className="w-full">
        <div className="flex justify-between text-xs uppercase mb-1">
          <span className={isCyan ? 'text-neonCyan/80' : 'text-neonMagenta/80'}>HP</span>
          <span className={isCyan ? 'text-neonCyan/60' : 'text-neonMagenta/60'}>
            {Math.max(0, Math.round(hp))} / {stats.maxHp}
          </span>
        </div>
        <HpBar current={hp} max={stats.maxHp} variant={variant} />
      </div>

      {/* Stats row */}
      <div className="flex gap-2 flex-wrap justify-center mt-1">
        <span className="stat-badge">⚔ ATK {stats.atk}</span>
        <span className="stat-badge">🛡 DEF {stats.def}</span>
        <span className="stat-badge">⚡ SPD {stats.spd}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN BATTLE COMPONENT
   ═══════════════════════════════════════════════ */

type BattlePhase = 'ready' | 'fighting' | 'ko';
const SPEEDS = [
  { label: '1×', ms: 1200 },
  { label: '2×', ms: 800 },
  { label: '3×', ms: 400 },
];

interface VersusBattleProps {
  aUser: ApiUser;
  bUser: ApiUser;
  aGames: ApiGame[];
  bGames: ApiGame[];
  onClose: () => void;
}

export default function VersusBattle({
  aUser,
  bUser,
  aGames,
  bGames,
  onClose,
}: VersusBattleProps) {
  const [phase, setPhase] = useState<BattlePhase>('ready');
  const [battleData, setBattleData] = useState<ReturnType<typeof computeBattle> | null>(null);
  const [turnIndex, setTurnIndex] = useState(-1);
  const [aHp, setAHp] = useState(0);
  const [bHp, setBHp] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [popups, setPopups] = useState<DmgPopup[]>([]);
  const [shaking, setShaking] = useState(false);
  const [critFlash, setCritFlash] = useState(false);
  const [parryChallenge, setParryChallenge] = useState<{
    turn: TurnResult;
    defenderGames: ApiGame[];
    attackerGames: ApiGame[];
  } | null>(null);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [winner, setWinner] = useState<'a' | 'b' | null>(null);
  const aHpRef = useRef(0);
  const bHpRef = useRef(0);
  const popupIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Pause chiptune on mount, resume on unmount
  useEffect(() => {
    window.dispatchEvent(new Event('battle-music-pause'));
    return () => {
      window.dispatchEvent(new Event('battle-music-resume'));
    };
  }, []);

  // Start / Rematch
  const startBattle = useCallback(() => {
    const data = computeBattle(aUser, bUser, aGames, bGames);
    setBattleData(data);
    aHpRef.current = data.aStats.maxHp;
    bHpRef.current = data.bStats.maxHp;
    setAHp(data.aStats.maxHp);
    setBHp(data.bStats.maxHp);
    setTurnIndex(-1);
    setPhase('fighting');
    setPopups([]);
    setShaking(false);
    setCritFlash(false);
    setParryChallenge(null);
    setShowSharePanel(false);
    setCopied(false);
    setWinner(null);
  }, [aUser, bUser, aGames, bGames]);

  // Advance one turn
  const advanceTurn = useCallback(() => {
    if (!battleData) return;

    // If either player is already at 0 HP, prevent further turns
    if (aHpRef.current <= 0 || bHpRef.current <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setWinner(aHpRef.current > 0 ? 'a' : 'b');
      setPhase('ko');
      sfx.ko();
      return;
    }

    setTurnIndex((prev) => {
      const next = prev + 1;
      if (next >= battleData.turns.length) {
        // Battle over
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setWinner(aHpRef.current >= bHpRef.current ? 'a' : 'b');
        setPhase('ko');
        sfx.ko();
        return prev;
      }

      const turn = battleData.turns[next];

      // Check if this turn is parryable and has not been resolved yet
      if (turn.parryable && !turn.isParried && !turn.isParryFailed) {
        // Setup parry QTE state
        setParryChallenge({
          turn,
          defenderGames: turn.attacker === 'a' ? bGames : aGames,
          attackerGames: turn.attacker === 'a' ? aGames : bGames,
        });
        // We do NOT increment the turnIndex here because we want to play this turn when it resumes!
        return prev;
      }

      // If we reach here, it is either not parryable, or it has already been resolved.
      // We apply HP changes and visual effects!
      const isLeft = turn.attacker === 'b';
      const actualDamage = turn.isParried ? Math.max(1, Math.round(turn.damage * 0.5)) : (turn.type === 'miss' ? 0 : turn.damage);

      if (turn.attacker === 'a') {
        const nextHp = Math.max(0, bHpRef.current - actualDamage);
        bHpRef.current = nextHp;
        setBHp(nextHp);
      } else {
        const nextHp = Math.max(0, aHpRef.current - actualDamage);
        aHpRef.current = nextHp;
        setAHp(nextHp);
      }

      // If either player reached 0 HP on this hit, trigger game over immediately
      if (aHpRef.current <= 0 || bHpRef.current <= 0) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setWinner(aHpRef.current > 0 ? 'a' : 'b');
        setPhase('ko');
        sfx.ko();
      }

      // Spawn damage popup
      const pid = ++popupIdRef.current;
      const targetSide: 'a' | 'b' = turn.attacker === 'a' ? 'b' : 'a';
      setPopups((ps) => [
        ...ps,
        { 
          id: pid, 
          side: targetSide, 
          type: turn.type === 'miss' ? 'miss' : (turn.isParried ? 'hit' : turn.type),
          damage: actualDamage,
          weaponGame: turn.weaponGame
        },
      ]);
      // Remove popup after animation
      setTimeout(() => {
        setPopups((ps) => ps.filter((p) => p.id !== pid));
      }, 1400);

      // Screen shake + flash + SFX on crit or hit
      if (turn.isParried) {
        sfx.hit();
      } else if (turn.type === 'crit') {
        setShaking(true);
        setCritFlash(true);
        sfx.crit();
        setTimeout(() => setShaking(false), 400);
        setTimeout(() => setCritFlash(false), 450);
      } else if (turn.type === 'miss') {
        sfx.miss();
      } else {
        sfx.hit();
      }

      // Auto-scroll log
      setTimeout(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);

      return next;
    });
  }, [battleData, aGames, bGames]);

  // Auto-play timer
  useEffect(() => {
    if (phase !== 'fighting' || parryChallenge !== null) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(advanceTurn, SPEEDS[speedIdx].ms);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, speedIdx, advanceTurn, parryChallenge]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const currentTurn = battleData && turnIndex >= 0 ? battleData.turns[turnIndex] : null;
  const visibleTurns = battleData ? battleData.turns.slice(0, turnIndex + 1) : [];

  // Generate beautiful brag message
  const winnerUser = winner === 'a' ? aUser : bUser;
  const winnerStats = battleData ? (winner === 'a' ? battleData.aStats : battleData.bStats) : null;
  const winnerHp = winner === 'a' ? aHp : bHp;
  const loserUser = winner === 'a' ? bUser : aUser;

  const bragMessage = battleData && winnerStats
    ? `🎮 GAMERCRED SHOWDOWN REPORT 🎮\n` +
      `🏆 WINNER: ${winnerUser.personaName} (HP: ${Math.round(winnerHp)}/${winnerStats.maxHp})\n` +
      `💀 DEFEATED: ${loserUser.personaName}\n` +
      `⚔️ Combat Stats: ${visibleTurns.length} turns · ` +
      `${visibleTurns.filter((t) => t.type === 'crit').length} crits · ` +
      `${visibleTurns.filter((t) => t.type === 'miss').length} misses\n` +
      `🔥 Fight your own battle at ${window.location.origin}!`
    : '';

  const handleCopyBrag = () => {
    navigator.clipboard.writeText(bragMessage).then(() => {
      setCopied(true);
      sfx.ping();
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={cn('battle-overlay', shaking && 'shake')}>
      {/* Crit flash overlay */}
      {critFlash && <div className="crit-flash" />}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-neonCyan/60 hover:text-neonCyan text-2xl z-50 transition-colors"
        aria-label="Close battle"
      >
        ✕
      </button>

      {/* ─── READY PHASE ─── */}
      {phase === 'ready' && (
        <div className="flex flex-col items-center gap-8 px-4">
          <div className="text-center">
            <div className="text-sm uppercase text-neonMagenta/80 tracking-widest">// VERSUS BATTLE</div>
            <h2 className="neon-yel text-4xl md:text-5xl uppercase mt-2">READY TO FIGHT?</h2>
          </div>

          <div className="flex items-center gap-6 md:gap-10 flex-wrap justify-center">
            <PlayerBattleCard
              user={aUser}
              stats={mapStats(aUser)}
              hp={mapStats(aUser).maxHp}
              variant="cyan"
              isWinner={false}
              isKo={false}
            />
            <div className="neon-mag text-5xl animate-glowpulse">VS</div>
            <PlayerBattleCard
              user={bUser}
              stats={mapStats(bUser)}
              hp={mapStats(bUser).maxHp}
              variant="mag"
              isWinner={false}
              isKo={false}
            />
          </div>

          {/* Stat legend */}
          <div className="text-center text-xs text-neonCyan/40 uppercase max-w-md space-y-1">
            <div>⚔ ATK = GAMES OWNED · 🛡 DEF = AVG RATING</div>
            <div>❤ HP = TOTAL PLAYTIME · ⚡ SPD = CRED SCORE</div>
          </div>

          <button onClick={startBattle} className="btn-arcade btn-mag text-xl px-8 py-3">
            ⚔️ FIGHT!
          </button>
        </div>
      )}

      {/* ─── FIGHTING / KO PHASE ─── */}
      {(phase === 'fighting' || phase === 'ko') && battleData && (
        <div className="flex flex-col items-center gap-4 px-4 w-full max-w-4xl relative">
          {/* Arena */}
          <div className="flex items-start gap-4 md:gap-8 flex-wrap justify-center w-full">
            <PlayerBattleCard
              user={aUser}
              stats={battleData.aStats}
              hp={aHp}
              variant="cyan"
              isWinner={phase === 'ko' && winner === 'a'}
              isKo={phase === 'ko' && winner === 'b'}
            />
            <div className="flex flex-col items-center gap-2 self-center">
              <div className="neon-mag text-3xl md:text-4xl animate-glowpulse">VS</div>
              {/* Speed controls */}
              {phase === 'fighting' && (
                <div className="flex gap-1">
                  {SPEEDS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSpeedIdx(i)}
                      className={cn('speed-btn', i === speedIdx && 'speed-btn--active')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <PlayerBattleCard
              user={bUser}
              stats={battleData.bStats}
              hp={bHp}
              variant="mag"
              isWinner={phase === 'ko' && winner === 'b'}
              isKo={phase === 'ko' && winner === 'a'}
            />
          </div>

          {/* Damage popups */}
          <DamagePopups popups={popups} />

          {/* Parry Challenge QTE Panel */}
          {parryChallenge && (
            <ParryChallenge
              defenderGames={parryChallenge.defenderGames}
              attackerGames={parryChallenge.attackerGames}
              correctGame={parryChallenge.turn.parryGame!}
              onParry={() => {
                const turn = parryChallenge.turn;
                const defenderName = turn.attacker === 'a' ? bUser.personaName : aUser.personaName;
                const reducedDmg = Math.max(1, Math.round(turn.damage * 0.5));
                turn.isParried = true;
                turn.message = `[${defenderName}] PARRIED ${turn.parryGame?.name}! 50% reduced → ${reducedDmg} DMG`;
                
                sfx.parry();
                setParryChallenge(null);
                
                // Immediately progress to applying resolved turn
                advanceTurn();
              }}
              onFail={() => {
                const turn = parryChallenge.turn;
                turn.isParryFailed = true;
                setParryChallenge(null);
                
                // Immediately progress to applying resolved turn
                advanceTurn();
              }}
            />
          )}

          {/* Turn indicator */}
          {phase === 'fighting' && currentTurn && !parryChallenge && (
            <div className="text-center mt-2">
              <span
                className={cn(
                  'text-base uppercase',
                  currentTurn.isParried && 'neon-grn font-bold',
                  currentTurn.isParryFailed && 'neon-yel',
                  !currentTurn.isParried && !currentTurn.isParryFailed && currentTurn.type === 'crit' && 'neon-yel',
                  !currentTurn.isParried && currentTurn.type === 'miss' && 'text-neonCyan/40',
                  !currentTurn.isParried && currentTurn.type === 'hit' &&
                    (currentTurn.attacker === 'a' ? 'neon' : 'neon-mag')
                )}
              >
                {currentTurn.message}
              </span>
            </div>
          )}

          {/* Battle log */}
          <div className="w-full max-w-lg mt-2">
            <div className="text-xs uppercase text-neonMagenta/60 mb-1">// COMBAT LOG</div>
            <div
              ref={logRef}
              className="battle-log border border-neonCyan/10 bg-bg/60 p-2 space-y-1"
            >
              {visibleTurns.map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'text-xs uppercase',
                    t.isParried && 'neon-grn font-bold',
                    t.isParryFailed && 'neon-yel',
                    !t.isParried && !t.isParryFailed && t.type === 'crit' && 'neon-yel',
                    !t.isParried && t.type === 'miss' && 'text-neonCyan/30',
                    !t.isParried && t.type === 'hit' && 'text-neonCyan/70'
                  )}
                >
                  <span className="text-neonMagenta/40 mr-1">T{i + 1}</span>
                  {t.message}
                </div>
              ))}
              {visibleTurns.length === 0 && (
                <div className="text-xs text-neonCyan/30 uppercase">Awaiting first move...</div>
              )}
            </div>
          </div>

          {/* K.O. overlay */}
          {phase === 'ko' && (
            <>
              {!showSharePanel ? (
                <div className="ko-overlay bg-bg/85">
                  <div className="ko-text neon-yel text-5xl md:text-6xl select-none font-bold animate-glowpulse">
                    K.O.!
                  </div>
                  <div className="mt-4 text-center">
                    <div className="text-sm uppercase text-neonCyan/60 tracking-widest">// WINNER //</div>
                    <div
                      className={cn(
                        'text-3xl md:text-4xl uppercase mt-1 winner-text font-bold',
                        winner === 'a' ? 'neon' : 'neon-mag'
                      )}
                    >
                      {winner === 'a' ? aUser.personaName : bUser.personaName}
                    </div>
                    <div className="text-xs text-neonCyan/40 uppercase mt-2 select-none">
                      {visibleTurns.length} TURNS · {visibleTurns.filter((t) => t.type === 'crit').length} CRITS · {visibleTurns.filter((t) => t.type === 'miss').length} MISSES
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-3 mt-6">
                    <button onClick={startBattle} className="btn-arcade text-base px-5 py-2">
                      🔄 REMATCH
                    </button>
                    <button
                      onClick={() => {
                        setShowSharePanel(true);
                        sfx.ping();
                      }}
                      className="btn-arcade btn-mag text-base px-5 py-2 animate-glowpulse"
                    >
                      📢 SHARE RESULT
                    </button>
                    <button onClick={onClose} className="btn-arcade text-base px-5 py-2" style={{ borderColor: 'hsl(0 0% 40%)', color: 'hsl(0 0% 60%)' }}>
                      ✕ CLOSE
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ko-overlay bg-bg/95 flex flex-col items-center justify-center p-4">
                  <div className="text-center mb-3 animate-glowpulse">
                    <h3 className="neon-yel text-2xl md:text-3xl uppercase font-bold tracking-wider">
                      📢 BRAG & SHARE RESULTS 📢
                    </h3>
                    <p className="text-xs text-neonCyan/60 uppercase tracking-widest mt-1">
                      Show off your gamer cred supremacy
                    </p>
                  </div>

                  {/* Brag Text Area */}
                  <div className="w-full max-w-md mb-3">
                    <div className="text-xs text-neonMagenta/60 uppercase mb-1 tracking-wider font-bold">
                      // PRE-FORMATTED BATTLE REPORT
                    </div>
                    <textarea
                      readOnly
                      value={bragMessage}
                      className="w-full h-28 p-2.5 bg-black/80 border border-neonCyan/30 rounded-sm text-neonCyan font-mono text-xs uppercase resize-none focus:outline-none focus:border-neonCyan"
                      style={{ textShadow: '0 0 4px hsl(180 100% 50% / 0.4)' }}
                    />
                    
                    {/* Copy Button */}
                    <button
                      onClick={handleCopyBrag}
                      className={cn(
                        'w-full mt-2 btn-arcade text-xs py-2 transition-all duration-300 font-bold',
                        copied ? 'btn-grn shadow-[0_0_12px_rgba(74,222,128,0.6)]' : 'btn-mag'
                      )}
                    >
                      {copied ? '⚡ COPIED TO CLIPBOARD! ⚡' : '📋 COPY BRAG REPORT'}
                    </button>
                  </div>

                  {/* Steam Chat Direct Link Section */}
                  <div className="w-full max-w-md mb-4 border border-neonCyan/20 bg-bg/85 p-3 rounded-sm text-center">
                    <div className="text-xs text-neonMagenta/60 uppercase mb-2 tracking-wider font-bold">
                      💬 SEND PERSONAL MESSAGE VIA STEAM CHAT
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      {[aUser, bUser].map((user) => {
                        const isReal = /^\d{17}$/.test(user.steamId);
                        return (
                          <a
                            key={user.steamId}
                            href={`steam://friends/message/${user.steamId}`}
                            className={cn(
                              'btn-arcade text-xs py-2.5 flex items-center justify-center gap-1.5 no-underline',
                              isReal ? 'border-neonCyan/40 hover:border-neonCyan/80 hover:bg-neonCyan/5' : 'opacity-70 cursor-not-allowed border-neonCyan/20'
                            )}
                            onClick={(e) => {
                              if (!isReal) {
                                e.preventDefault();
                                alert(`Mock Steam ID detected (${user.steamId}). In production, this launches the Steam client chat with this player.`);
                              }
                            }}
                          >
                            <span>💬 MESSAGE {user.personaName.toUpperCase()}</span>
                            {!isReal && (
                              <span className="text-[9px] bg-neonMagenta/20 text-neonMagenta border border-neonMagenta/40 px-1 rounded-sm scale-90">
                                MOCK
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                    
                    <p className="text-[10px] text-neonCyan/40 uppercase mt-2.5 leading-tight">
                      Tip: Copy the report first, click a message button to open the Steam desktop chat, and paste it directly!
                    </p>
                  </div>

                  {/* Back Button */}
                  <button
                    onClick={() => {
                      setShowSharePanel(false);
                      sfx.ping();
                    }}
                    className="btn-arcade text-xs px-6 py-2"
                  >
                    ◀ BACK TO RESULTS
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
