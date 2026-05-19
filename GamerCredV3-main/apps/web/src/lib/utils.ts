export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function formatCred(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

export function formatHours(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '<1H';
  return `${Math.round(n).toLocaleString('en-US')}H`;
}

export function ratingColor(pct: number): string {
  if (pct >= 0.9) return 'text-neonGreen';
  if (pct >= 0.75) return 'text-neonCyan';
  if (pct >= 0.6) return 'text-neonYellow';
  return 'text-neonMagenta';
}

export function ratingLabel(pct: number): string {
  if (pct >= 0.95) return 'OVERWHELMINGLY POSITIVE';
  if (pct >= 0.85) return 'VERY POSITIVE';
  if (pct >= 0.7) return 'MOSTLY POSITIVE';
  if (pct >= 0.5) return 'MIXED';
  if (pct > 0) return 'NEGATIVE';
  return 'NO REVIEWS';
}
