/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0b',
        surface: '#141416',
        card: '#1c1c1f',
        border: '#2a2a2e',
        muted: '#8a8a92',
        text: '#f5f5f7',
        accent: '#3b82f6',
        success: '#22c55e',
        danger: '#ef4444',
        warn: '#f59e0b'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
