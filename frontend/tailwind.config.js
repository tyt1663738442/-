/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stock: {
          up: '#ef4444',      // 红色 - 涨
          down: '#22c55e',    // 绿色 - 跌
          bg: '#0f172a',      // 深色背景
          card: '#1e293b',    // 卡片背景
          border: '#334155',  // 边框色
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash-red': 'flashRed 0.5s ease-in-out',
        'flash-green': 'flashGreen 0.5s ease-in-out',
      },
      keyframes: {
        flashRed: {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(239, 68, 68, 0.3)' },
        },
        flashGreen: {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'rgba(34, 197, 94, 0.3)' },
        },
      },
    },
  },
  plugins: [],
}
