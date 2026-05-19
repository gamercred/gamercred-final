import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// A minor pentatonic: A C D E G across two octaves
const SCALE_HZ = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];

// 32-step lead pattern (indices into SCALE_HZ; -1 = rest)
const LEAD: number[] = [
  5, -1, 4, -1, 6, -1, 7, -1,
  5, -1, 4, 3, 2, -1, 4, -1,
  5, -1, 7, -1, 9, -1, 7, 6,
  5, 4, 5, -1, 4, 2, 0, -1,
];
const BASS: number[] = [
  0, -1, -1, -1, 0, -1, -1, -1,
  2, -1, -1, -1, 2, -1, -1, -1,
  3, -1, -1, -1, 3, -1, -1, -1,
  4, -1, -1, -1, 0, -1, -1, -1,
];

export default function ChiptuneToggle() {
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const stepRef = useRef(0);

  function ensureCtx() {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      gainRef.current = master;
    }
    return ctxRef.current!;
  }

  function blip(time: number, freq: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = ctxRef.current!;
    const master = gainRef.current!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function noiseHat(time: number) {
    const ctx = ctxRef.current!;
    const master = gainRef.current!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.14, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(time);
    src.stop(time + 0.06);
  }

  function start() {
    const ctx = ensureCtx();
    if (ctx.state === 'suspended') ctx.resume();
    if (gainRef.current) gainRef.current.gain.value = 0.18;

    // 16th notes at ~110 BPM (eighths feel) -> ~180ms step
    const stepSec = 0.18;
    // Schedule 4 steps ahead, every 4*stepSec interval
    const tick = () => {
      const ctx = ctxRef.current!;
      const baseTime = ctx.currentTime + 0.02;
      for (let i = 0; i < 4; i++) {
        const t = baseTime + i * stepSec;
        const step = stepRef.current % 32;
        const lead = LEAD[step];
        const bass = BASS[step];
        if (lead !== -1) blip(t, SCALE_HZ[lead] * 2, stepSec * 0.85, 'square', 0.18);
        if (bass !== -1) blip(t, SCALE_HZ[bass] * 0.5, stepSec * 1.6, 'sawtooth', 0.22);
        // Hat on every other step
        if (step % 2 === 0) noiseHat(t);
        stepRef.current = step + 1;
      }
    };
    tick();
    intervalRef.current = window.setInterval(tick, stepSec * 4 * 1000);
  }

  function stop() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (gainRef.current) gainRef.current.gain.value = 0;
  }

  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      onClick={() => {
        setOn((prev) => {
          const next = !prev;
          if (next) start(); else stop();
          return next;
        });
      }}
      className="fixed bottom-4 right-4 z-50 btn-ghost"
      aria-label={on ? 'mute music' : 'play music'}
      title={on ? 'MUTE' : 'PLAY MUSIC'}
    >
      {on ? <Volume2 size={20} className="text-neonCyan" /> : <VolumeX size={20} className="text-neonCyan/60" />}
      <span className="text-sm">{on ? 'ON' : 'OFF'}</span>
    </button>
  );
}
