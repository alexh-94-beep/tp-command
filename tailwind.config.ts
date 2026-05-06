import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Status-Farben für Belegung, Reinigung, Zahlung
        status: {
          available: '#22c55e',
          occupied: '#3b82f6',
          blocked: '#ef4444',
          maintenance: '#f59e0b',
        },
        priority: {
          low: '#94a3b8',
          normal: '#3b82f6',
          high: '#f59e0b',
          urgent: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
