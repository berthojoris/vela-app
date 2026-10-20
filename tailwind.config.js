/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        vela: {
          darkest: '#09090b',
          darker: '#0f0f12',
          dark: '#141418',
          card: '#18181d',
          hover: '#212128',
          border: '#27272f',
          borderLight: '#353540',
          text: '#f4f4f6',
          muted: '#8c8c9a',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
        orca: {
          darkest: '#09090b',
          darker: '#0f0f12',
          dark: '#141418',
          card: '#18181d',
          hover: '#212128',
          border: '#27272f',
          borderLight: '#353540',
          text: '#f4f4f6',
          muted: '#8c8c9a',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
