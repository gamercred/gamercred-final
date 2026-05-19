import { useEffect, useRef } from 'react';

type Shape = 'triangle' | 'hexagon' | 'square' | 'diamond';

interface Floater {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vrot: number;
  shape: Shape;
  color: string;
}

const COLORS = [
  'hsl(180 100% 50%)',
  'hsl(180 100% 65%)',
  'hsl(320 100% 50%)',
  'hsl(320 100% 70%)',
  'hsl(270 100% 65%)',
];
const SHAPES: Shape[] = ['triangle', 'hexagon', 'square', 'diamond'];

function makeFloater(w: number, h: number): Floater {
  const size = 22 + Math.random() * 60;
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.35,
    size,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.005,
    shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
}

function drawShape(ctx: CanvasRenderingContext2D, f: Floater) {
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.strokeStyle = f.color;
  ctx.lineWidth = 1.25;
  ctx.shadowColor = f.color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  const r = f.size / 2;
  switch (f.shape) {
    case 'triangle': {
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.866, r * 0.5);
      ctx.lineTo(-r * 0.866, r * 0.5);
      ctx.closePath();
      break;
    }
    case 'hexagon': {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    }
    case 'square': {
      ctx.rect(-r, -r, r * 2, r * 2);
      break;
    }
    case 'diamond': {
      ctx.moveTo(0, -r);
      ctx.lineTo(r, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r, 0);
      ctx.closePath();
      break;
    }
  }
  ctx.stroke();
  ctx.restore();
}

export default function GeometricBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let floaters: Floater[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      if (!canvas) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.floor(24 + (w * h) / 35000);
      const target = Math.min(48, Math.max(20, count));
      while (floaters.length < target) floaters.push(makeFloater(w, h));
      floaters = floaters.slice(0, target);
    }
    resize();
    window.addEventListener('resize', resize);

    function tick() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);
      for (const f of floaters) {
        f.x += f.vx;
        f.y += f.vy;
        f.rot += f.vrot;
        // Wrap
        const m = f.size;
        if (f.x < -m) f.x = w + m;
        if (f.x > w + m) f.x = -m;
        if (f.y < -m) f.y = h + m;
        if (f.y > h + m) f.y = -m;
        drawShape(ctx!, f);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="bg-canvas" aria-hidden />;
}
