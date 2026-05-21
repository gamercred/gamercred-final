import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { ApiUser, ApiGame } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Local alias — keeps the spec's GameEntry naming, mapped to the actual ApiGame.
 *  `rating` (spec) === `positivePct` (api). */
type GameEntry = ApiGame;

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
    this.noiseBurst(t, 0.12, 0.3);
  }

  /** K.O. fanfare — ascending arpeggio */
  ko() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
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

  /** Parry success — rising triangle arpeggio, short and crisp */
  parry() {
    const { ctx, master } = this.ensureCtx();
    const t = ctx.currentTime;
    const notes = [659.25, 987.77, 1318.51]; // E5 B5 E6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const start = t + i * 0.05;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 0.2);
    });
    this.noiseBurst(t, 0.04, 0.08);
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

const sfx = new BattleSFX();

/* ═══════════════════════════════════════════════
   STAT MAPPING — Steam data → RPG attributes
   ═══════════════════════════════════════════════ */

interface BattleStats {
  atk: number;
  hp: number;
  maxHp: number;
  def: number;
  spd: number;
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
  /** Game from attacker's library — shown as the "weapon" on crit flashes. */
  weaponGame?: { appid: number; name: string; cover: string };
  /** True if this turn pauses for a parry QTE. */
  parryable?: boolean;
  /** Correct game the defender must click to parry. */
  parryGame?: { appid: number; name: string; cover: string };
};

/** Pick a random element from the top-N rated games in a library.
 *  Returns null if the pool is empty or no games have a rating. */
function pickWeaponGame(games: GameEntry[], topN: number): { appid: number; name: string; cover: string } | null {
  if (!games || games.length === 0) return null;
  const rated = games.filter((g) => typeof g.positivePct === 'number' && g.positivePct > 0 && g.cover);
  if (rated.length === 0) return null;
  const sorted = [...rated].sort((x, y) => (y.positivePct || 0) - (x.positivePct || 0));
  const pool = sorted.slice(0, Math.min(topN, sorted.length));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return { appid: pick.appid, name: pick.name, cover: pick.cover };
}

function computeBattle(
  aUser: ApiUser,
  bUser: ApiUser,
  aGames: GameEntry[],
  bGames: GameEntry[]
): { turns: TurnResult[]; aStats: BattleStats; bStats: BattleStats; winner: 'a' | 'b' } {
  const aStats = mapStats(aUser);
  const bStats = mapStats(bUser);

  let aHp = aStats.maxHp;
  let bHp = bStats.maxHp;
  const turns: TurnResult[] = [];

  let firstAttacker: 'a' | 'b';
  if (aStats.spd > bStats.spd) firstAttacker = 'a';
  else if (bStats.spd > aStats.spd) firstAttacker = 'b';
  else firstAttacker = Math.random() < 0.5 ? 'a' : 'b';

  let current: 'a' | 'b' = firstAttacker;
  const maxRounds = 200;

  for (let i = 0; i < maxRounds && aHp > 0 && bHp > 0; i++) {
    const attackerStats = current === 'a' ? aStats : bStats;
    const defenderStats = current === 'a' ? bStats : aStats;
    const attackerName = current === 'a' ? aUser.personaName : bUser.personaName;
    const defenderName = current === 'a' ? bUser.personaName : aUser.personaName;

    const missRoll = Math.random();
    if (missRoll < 0.10) {
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
      const variance = 0.8 + Math.random() * 0.4;
      const defReduction = 1 - defenderStats.def / 200;
      let damage = Math.round(attackerStats.atk * defReduction * variance * 1.2);
      if (isCrit) damage = Math.round(damage * 1.5);
      const defenderHp = current === 'a' ? bHp : aHp;
      const defenderMaxHp = defenderStats.hp;
      if (defenderHp < defenderMaxHp * 0.4) {
        damage = Math.round(damage * 1.8);
      }
      damage = Math.max(1, damage);

      if (current === 'a') {
        bHp = Math.max(0, bHp - damage);
      } else {
        aHp = Math.max(0, aHp - damage);
      }

      const critTag = isCrit ? ' CRITICAL HIT!' : '';

      // Pick the attacker's "weapon" — top-rated game flash on crit
      const attackerGames = current === 'a' ? aGames : bGames;
      const defenderGames = current === 'a' ? bGames : aGames;
      const weaponGame = isCrit ? pickWeaponGame(attackerGames, 10) ?? undefined : undefined;

      // ~30% of hits, ~50% of crits are parryable. Misses never.
      const parryRoll = Math.random();
      const parryable = isCrit ? parryRoll < 0.5 : parryRoll < 0.3;
      const parryGameRaw = parryable ? pickWeaponGame(defenderGames, 20) : null;
      const finalParryable = parryable && !!parryGameRaw;
      const parryGame = parryGameRaw ?? undefined;

      turns.push({
        attacker: current,
        type: isCrit ? 'crit' : 'hit',
        damage,
        aHpAfter: aHp,
        bHpAfter: bHp,
        message: `${attackerName} deals ${damage} DMG to ${defenderName}!${critTag}`,
        weaponGame,
        parryable: finalParryable,
        parryGame: finalParryable ? parryGame : undefined,
      });
    }

    current = current === 'a' ? 'b' : 'a';
  }

  const winner: 'a' | 'b' = bHp <= 0 ? 'a' : 'b';
  return { turns, aStats, bStats, winner };
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
  parried?: boolean;
}

function DamagePopups({ popups }: { popups: DmgPopup[] }) {
  return (
    <>
      {popups.map((p) => {
        const isLeft = p.side === 'b';
        const style: React.CSSProperties = {
          left: isLeft ? '18%' : '68%',
          top: `${25 + Math.random() * 10}%`,
          color: p.parried
            ? 'hsl(140 100% 70%)'
            : p.type === 'miss'
            ? 'hsl(0 0% 50%)'
            : p.type === 'crit'
            ? 'hsl(55 100% 70%)'
            : p.side === 'a'
            ? 'hsl(320 100% 70%)'
            : 'hsl(180 100% 70%)',
        };
        const labelText = p.parried
          ? `PARRIED -${p.damage}`
          : p.type === 'miss'
          ? 'MISS'
          : p.type === 'crit'
          ? p.weaponGame
            ? `⚡ ${p.weaponGame.name.toUpperCase()} — ${p.damage} DMG ⚡`
            : `⚡ ${p.damage} ⚡`
          : `-${p.damage}`;
        return (
          <div
            key={p.id}
            className={cn(
              'dmg-pop',
              p.type === 'crit' && !p.parried && 'dmg-pop--crit',
              p.type === 'miss' && 'dmg-pop--miss',
              p.parried && 'dmg-pop--parried',
              p.weaponGame && 'dmg-pop--weapon'
            )}
            style={style}
          >
            {p.weaponGame && p.type === 'crit' && !p.parried && (
              <div className="weapon-flash-cover">
                <img src={p.weaponGame.cover} alt="" />
              </div>
            )}
            <div className="dmg-pop-label">{labelText}</div>
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
      <img
        src={user.avatar}
        alt=""
        className={cn(
          'w-16 h-16 border-2',
          isCyan ? 'border-neonCyan/60' : 'border-neonMagenta/60',
          isKo && 'rotate-12'
        )}
      />

      <div
        className={cn(
          'text-lg uppercase truncate max-w-full',
          isCyan ? 'neon' : 'neon-mag',
          isWinner && 'winner-text'
        )}
      >
        {user.personaName}
      </div>

      <div className="w-full">
        <div className="flex justify-between text-xs uppercase mb-1">
          <span className={isCyan ? 'text-neonCyan/80' : 'text-neonMagenta/80'}>HP</span>
          <span className={isCyan ? 'text-neonCyan/60' : 'text-neonMagenta/60'}>
            {Math.max(0, Math.round(hp))} / {stats.maxHp}
          </span>
        </div>
        <HpBar current={hp} max={stats.maxHp} variant={variant} />
      </div>

      <div className="flex gap-2 flex-wrap justify-center mt-1">
        <span className="stat-badge">⚔ ATK {stats.atk}</span>
        <span className="stat-badge">🛡 DEF {stats.def}</span>
        <span className="stat-badge">⚡ SPD {stats.spd}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PARRY CHALLENGE — Quick-Time Event component
   ═══════════════════════════════════════════════ */

interface ParryChallengeProps {
  defenderGames: GameEntry[];
  attackerGames: GameEntry[];
  correctGame: { appid: number; name: string; cover: string };
  onParry: () => void;
  onFail: () => void;
  timeMs?: number;
}

function ParryChallenge({
  defenderGames,
  attackerGames,
  correctGame,
  onParry,
  onFail,
  timeMs = 1500,
}: ParryChallengeProps) {
  const choices = useMemo(() => {
    const used = new Set<number>([correctGame.appid]);
    const decoys: { appid: number; name: string; cover: string }[] = [];

    const attackerPool = [...attackerGames]
      .filter((g) => g.cover && !used.has(g.appid))
      .sort(() => Math.random() - 0.5);
    for (const g of attackerPool) {
      if (decoys.length >= 3) break;
      if (used.has(g.appid)) continue;
      decoys.push({ appid: g.appid, name: g.name, cover: g.cover });
      used.add(g.appid);
    }

    if (decoys.length < 3) {
      const defenderPool = [...defenderGames]
        .filter((g) => g.cover && !used.has(g.appid))
        .sort(() => Math.random() - 0.5);
      for (const g of defenderPool) {
        if (decoys.length >= 3) break;
        if (used.has(g.appid)) continue;
        decoys.push({ appid: g.appid, name: g.name, cover: g.cover });
        used.add(g.appid);
      }
    }

    const combined = [correctGame, ...decoys];
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined;
  }, [defenderGames, attackerGames, correctGame]);

  const [feedback, setFeedback] = useState<
    | { kind: 'parried'; appid: number }
    | { kind: 'wrong'; appid: number }
    | { kind: 'timeout' }
    | null
  >(null);
  const settledRef = useRef(false);
  const startMs = useRef(performance.now());
  const [now, setNow] = useState(performance.now());

  useEffect(() => {
    let raf = 0;
    let timeoutId: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(performance.now());
      const elapsed = performance.now() - startMs.current;
      if (elapsed >= timeMs && !settledRef.current) {
        settledRef.current = true;
        setFeedback({ kind: 'timeout' });
        timeoutId = setTimeout(() => onFail(), 450);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeoutId!);
    };
  }, [timeMs, onFail]);

  const handleClick = (appid: number) => {
    if (settledRef.current) return;
    if (appid === correctGame.appid) {
      settledRef.current = true;
      setFeedback({ kind: 'parried', appid });
      sfx.parry();
      setTimeout(() => onParry(), 380);
    } else {
      settledRef.current = true;
      setFeedback({ kind: 'wrong', appid });
      setTimeout(() => onFail(), 380);
    }
  };

  const elapsed = now - startMs.current;
  const pct = Math.max(0, 1 - elapsed / timeMs) * 100;
  const isTimeout = feedback?.kind === 'timeout';

  return (
    <div
      className={cn(
        'parry-panel w-full max-w-2xl mx-auto px-3 py-4 rounded-sm',
        'bg-bg/90 border border-neonYellow/40',
        isTimeout && 'shake'
      )}
      style={{
        boxShadow:
          '0 0 22px hsl(55 100% 60% / 0.35), inset 0 0 18px hsl(55 100% 60% / 0.08)',
      }}
    >
      <div className="text-center mb-3">
        {!feedback && (
          <div className="neon-yel text-2xl uppercase animate-glowpulse tracking-wider">
            ⚡ INCOMING! PARRY NOW! ⚡
          </div>
        )}
        {feedback?.kind === 'parried' && (
          <div className="neon-grn text-2xl uppercase tracking-wider">
            ✓ PARRIED! -50% DMG
          </div>
        )}
        {feedback?.kind === 'wrong' && (
          <div
            className="text-2xl uppercase tracking-wider"
            style={{ color: 'hsl(0 100% 70%)', textShadow: '0 0 10px hsl(0 100% 50% / 0.8)' }}
          >
            ✗ MISS! FULL DMG
          </div>
        )}
        {feedback?.kind === 'timeout' && (
          <div
            className="text-2xl uppercase tracking-wider"
            style={{ color: 'hsl(0 100% 70%)', textShadow: '0 0 10px hsl(0 100% 50% / 0.8)' }}
          >
            ✗ TOO SLOW!
          </div>
        )}
      </div>

      <div className="parry-timer-track">
        <div
          className="parry-timer-fill"
          style={{
            width: `${pct}%`,
            transition: feedback ? 'none' : 'width 50ms linear',
          }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 md:gap-3 mt-3">
        {choices.map((g) => {
          const isCorrect = g.appid === correctGame.appid;
          const wasClickedWrong = feedback?.kind === 'wrong' && feedback.appid === g.appid;
          const wasClickedRight = feedback?.kind === 'parried' && feedback.appid === g.appid;
          const revealCorrectOnTimeout = isTimeout && isCorrect;
          return (
            <button
              key={g.appid}
              onClick={() => handleClick(g.appid)}
              disabled={!!feedback}
              className={cn(
                'game-card p-1.5 md:p-2 text-left transition-transform',
                !feedback && 'hover:scale-105 cursor-pointer',
                wasClickedRight && 'ring-2 ring-green-400',
                wasClickedWrong && 'ring-2 ring-red-500 shake',
                revealCorrectOnTimeout && 'ring-2 ring-green-400'
              )}
              style={{
                transform: wasClickedRight ? 'scale(1.08)' : undefined,
              }}
            >
              <img
                src={g.cover}
                alt=""
                className="w-full h-auto block"
                style={{ aspectRatio: '460 / 215', objectFit: 'cover' }}
                loading="eager"
              />
              <div
                className="text-[0.65rem] md:text-xs uppercase mt-1 truncate"
                style={{ lineHeight: 1.1 }}
              >
                {g.name}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN BATTLE COMPONENT
   ═══════════════════════════════════════════════ */

type BattlePhase = 'ready' | 'fighting' | 'ko';
const SPEEDS = [
  { label: '1×', ms: 800 },
  { label: '2×', ms: 400 },
  { label: '3×', ms: 200 },
];

export default function VersusBattle({
  aUser,
  bUser,
  aGames,
  bGames,
  onClose,
}: {
  aUser: ApiUser;
  bUser: ApiUser;
  aGames: GameEntry[];
  bGames: GameEntry[];
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<BattlePhase>('ready');
  const [battleData, setBattleData] = useState<ReturnType<typeof computeBattle> | null>(null);
  const [turnIndex, setTurnIndex] = useState(-1);
  const [aHp, setAHp] = useState(0);
  const [bHp, setBHp] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [popups, setPopups] = useState<DmgPopup[]>([]);
  const [shaking, setShaking] = useState(false);
  const [critFlash, setCritFlash] = useState(false);
  /** Active parry QTE — when non-null, the battle is paused waiting for the user. */
  const [parryChallenge, setParryChallenge] = useState<{
    turn: TurnResult;
    turnIndex: number;
    defenderSide: 'a' | 'b';
    defenderGames: GameEntry[];
    attackerGames: GameEntry[];
  } | null>(null);
  /** Map of turnIndex → outcome, so the log can render parried turns differently. */
  const [parriedTurns, setParriedTurns] = useState<Record<number, 'parried' | 'failed'>>({});
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
    const data = computeBattle(aUser, bUser, aGames ?? [], bGames ?? []);
    setBattleData(data);
    setAHp(data.aStats.maxHp);
    setBHp(data.bStats.maxHp);
    setTurnIndex(-1);
    setPhase('fighting');
    setPopups([]);
    setShaking(false);
    setCritFlash(false);
    setParryChallenge(null);
    setParriedTurns({});
  }, [aUser, bUser, aGames, bGames]);

  // Apply the visual + audio + state for a turn. Used both for normal turns
  // and after a parry QTE resolves (with optional reducedDamage).
  const applyTurn = useCallback(
    (
      idx: number,
      turn: TurnResult,
      opts?: { reducedDamage?: boolean }
    ) => {
      const reduced = opts?.reducedDamage === true;
      const displayDamage = reduced ? Math.max(1, Math.round(turn.damage * 0.5)) : turn.damage;

      setAHp(turn.aHpAfter);
      setBHp(turn.bHpAfter);

      const pid = ++popupIdRef.current;
      const targetSide: 'a' | 'b' = turn.attacker === 'a' ? 'b' : 'a';
      setPopups((ps) => [
        ...ps,
        {
          id: pid,
          side: targetSide,
          type: turn.type,
          damage: displayDamage,
          weaponGame: turn.type === 'crit' && !reduced ? turn.weaponGame : undefined,
          parried: reduced,
        },
      ]);
      setTimeout(() => {
        setPopups((ps) => ps.filter((p) => p.id !== pid));
      }, 1400);

      if (turn.type === 'crit' && !reduced) {
        setShaking(true);
        setCritFlash(true);
        sfx.crit();
        setTimeout(() => setShaking(false), 400);
        setTimeout(() => setCritFlash(false), 450);
      } else if (turn.type === 'miss') {
        sfx.miss();
      } else if (!reduced) {
        sfx.hit();
      }

      setTimeout(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);

      void idx;
    },
    []
  );

  // Resolve callbacks for an in-flight parry challenge.
  const resolveParry = useCallback(
    (parried: boolean) => {
      setParryChallenge((cur) => {
        if (!cur) return null;
        setParriedTurns((m) => ({ ...m, [cur.turnIndex]: parried ? 'parried' : 'failed' }));
        applyTurn(cur.turnIndex, cur.turn, { reducedDamage: parried });
        setTurnIndex(cur.turnIndex);
        return null;
      });
    },
    [applyTurn]
  );

  // Advance one turn
  const advanceTurn = useCallback(() => {
    if (!battleData) return;
    if (parryChallenge) return;

    setTurnIndex((prev) => {
      const next = prev + 1;
      if (next >= battleData.turns.length) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setPhase('ko');
        sfx.ko();
        return prev;
      }

      const turn = battleData.turns[next];

      // Parryable turn? Trigger QTE and hold cursor — resolveParry will advance it.
      if (turn.parryable && turn.parryGame) {
        const defenderSide: 'a' | 'b' = turn.attacker === 'a' ? 'b' : 'a';
        const defenderGames = defenderSide === 'a' ? (aGames ?? []) : (bGames ?? []);
        const attackerGames = turn.attacker === 'a' ? (aGames ?? []) : (bGames ?? []);
        setParryChallenge((existing) => {
          if (existing) return existing;
          return {
            turn,
            turnIndex: next,
            defenderSide,
            defenderGames,
            attackerGames,
          };
        });
        return prev;
      }

      applyTurn(next, turn);
      return next;
    });
  }, [battleData, parryChallenge, aGames, bGames, applyTurn]);

  // Auto-play timer. Pauses during QTE regardless of selected speed.
  useEffect(() => {
    if (phase !== 'fighting') return;
    if (parryChallenge) {
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

  return (
    <div className={cn('battle-overlay', shaking && 'shake')}>
      {critFlash && <div className="crit-flash" />}

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
          <div className="flex items-start gap-4 md:gap-8 flex-wrap justify-center w-full">
            <PlayerBattleCard
              user={aUser}
              stats={battleData.aStats}
              hp={aHp}
              variant="cyan"
              isWinner={phase === 'ko' && battleData.winner === 'a'}
              isKo={phase === 'ko' && battleData.winner === 'b'}
            />
            <div className="flex flex-col items-center gap-2 self-center">
              <div className="neon-mag text-3xl md:text-4xl animate-glowpulse">VS</div>
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
              isWinner={phase === 'ko' && battleData.winner === 'b'}
              isKo={phase === 'ko' && battleData.winner === 'a'}
            />
          </div>

          <DamagePopups popups={popups} />

          {/* Parry QTE — pauses the battle while active */}
          {parryChallenge && parryChallenge.turn.parryGame && (
            <ParryChallenge
              defenderGames={parryChallenge.defenderGames}
              attackerGames={parryChallenge.attackerGames}
              correctGame={parryChallenge.turn.parryGame}
              onParry={() => resolveParry(true)}
              onFail={() => resolveParry(false)}
            />
          )}

          {phase === 'fighting' && currentTurn && !parryChallenge && (
            <div className="text-center mt-2">
              <span
                className={cn(
                  'text-base uppercase',
                  currentTurn.type === 'crit' && 'neon-yel',
                  currentTurn.type === 'miss' && 'text-neonCyan/40',
                  currentTurn.type === 'hit' &&
                    (currentTurn.attacker === 'a' ? 'neon' : 'neon-mag')
                )}
              >
                {currentTurn.message}
              </span>
            </div>
          )}

          <div className="w-full max-w-lg mt-2">
            <div className="text-xs uppercase text-neonMagenta/60 mb-1">// COMBAT LOG</div>
            <div
              ref={logRef}
              className="battle-log border border-neonCyan/10 bg-bg/60 p-2 space-y-1"
            >
              {visibleTurns.map((t, i) => {
                const outcome = parriedTurns[i];
                const wasParried = outcome === 'parried';
                if (wasParried) {
                  const defenderName =
                    t.attacker === 'a' ? bUser.personaName : aUser.personaName;
                  const reduced = Math.max(1, Math.round(t.damage * 0.5));
                  const weaponName = t.parryGame?.name ?? t.weaponGame?.name ?? 'ATTACK';
                  return (
                    <div key={i} className="text-xs uppercase neon-grn">
                      <span className="text-neonMagenta/40 mr-1">T{i + 1}</span>
                      [{defenderName}] PARRIED {weaponName}! 50% reduced → {reduced} DMG
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    className={cn(
                      'text-xs uppercase',
                      t.type === 'crit' && 'neon-yel',
                      t.type === 'miss' && 'text-neonCyan/30',
                      t.type === 'hit' && 'text-neonCyan/70'
                    )}
                  >
                    <span className="text-neonMagenta/40 mr-1">T{i + 1}</span>
                    {t.message}
                  </div>
                );
              })}
              {visibleTurns.length === 0 && (
                <div className="text-xs text-neonCyan/30 uppercase">Awaiting first move...</div>
              )}
            </div>
          </div>

          {phase === 'ko' && (
            <div className="ko-overlay bg-bg/80">
              <div className="ko-text neon-yel">K.O.!</div>
              <div className="mt-4 text-center">
                <div className="text-sm uppercase text-neonCyan/60 tracking-widest">WINNER</div>
                <div
                  className={cn(
                    'text-3xl md:text-4xl uppercase mt-1 winner-text',
                    battleData.winner === 'a' ? 'neon' : 'neon-mag'
                  )}
                >
                  {battleData.winner === 'a' ? aUser.personaName : bUser.personaName}
                </div>
                <div className="text-xs text-neonCyan/40 uppercase mt-2">
                  {visibleTurns.length} TURNS · {visibleTurns.filter((t) => t.type === 'crit').length} CRITS · {visibleTurns.filter((t) => t.type === 'miss').length} MISSES · {Object.values(parriedTurns).filter((v) => v === 'parried').length} PARRIES
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={startBattle} className="btn-arcade text-base px-5 py-2">
                  🔄 REMATCH
                </button>
                <button onClick={onClose} className="btn-arcade btn-mag text-base px-5 py-2">
                  ✕ CLOSE
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
