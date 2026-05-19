/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'hsl(220 30% 5%)',
        bg2: 'hsl(220 30% 8%)',
        panel: 'hsl(220 30% 10%)',
        neonCyan: 'hsl(180 100% 50%)',
        neonMagenta: 'hsl(320 100% 50%)',
        neonPurple: 'hsl(270 100% 60%)',
        neonYellow: 'hsl(55 100% 60%)',
        neonGreen: 'hsl(140 100% 55%)',
        scanline: 'rgba(0, 255, 255, 0.04)',
      },
      fontFamily: {
        arcade: ['"VT323"', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        flicker: {
          '0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%': { opacity: '1' },
          '20%, 21.999%, 63%, 63.999%, 65%, 69.999%': { opacity: '0.6' },
        },
        scanmove: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 100vh' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        glowpulse: {
          '0%, 100%': { textShadow: '0 0 8px hsl(180 100% 50% / 0.6), 0 0 18px hsl(180 100% 50% / 0.4)' },
          '50%': { textShadow: '0 0 14px hsl(180 100% 50% / 0.9), 0 0 28px hsl(180 100% 50% / 0.6)' },
        },
        battleShake: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%': { transform: 'translate(-6px, 3px)' },
          '20%': { transform: 'translate(5px, -4px)' },
          '30%': { transform: 'translate(-4px, 2px)' },
          '40%': { transform: 'translate(3px, -3px)' },
          '50%': { transform: 'translate(-2px, 1px)' },
        },
      },
      animation: {
        flicker: 'flicker 4s linear infinite',
        scanmove: 'scanmove 8s linear infinite',
        marquee: 'marquee 30s linear infinite',
        blink: 'blink 1s steps(1) infinite',
        glowpulse: 'glowpulse 2.5s ease-in-out infinite',
        battleShake: 'battleShake 0.35s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
