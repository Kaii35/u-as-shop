import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blush: '#E8C8CF',
        nude: '#F5E7E8',
        ivory: '#FAF7F2',
        wine: { DEFAULT: '#572B3A', dark: '#3F1E2A' },
        ink: '#242124',
        muted: '#6E6368',
        danger: '#A3213A',
        ok: '#5E8C6A',
        warn: '#C98A3E',
      },
      fontFamily: {
        display: ['"Bodoni Moda"', 'serif'],
        sans: ['Jost', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 30px 60px -30px rgba(36,33,36,.4)',
        pop: '0 40px 80px -30px rgba(87,43,58,.35)',
        drawer: '-30px 0 80px -40px rgba(36,33,36,.5)',
      },
      transitionTimingFunction: {
        silk: 'cubic-bezier(.2,.7,.2,1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
