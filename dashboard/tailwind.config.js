/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        hand: ['Caveat', 'cursive', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        pulse: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        risk: {
          low: '#10b981',
          medium: '#f59e0b',
          high: '#f43f5e',
          critical: '#e11d48',
        },
      },
      boxShadow: {
        'liquid-glow': '0 0 35px -5px rgba(99, 102, 241, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.2)',
        'liquid-card': '0 20px 40px -15px rgba(0, 0, 0, 0.7), inset 0 1px 2px 0 rgba(255, 255, 255, 0.15)',
        'neon-cyan': '0 0 25px -3px rgba(6, 182, 212, 0.4)',
        'neon-rose': '0 0 25px -3px rgba(244, 63, 94, 0.4)',
        'neon-emerald': '0 0 25px -3px rgba(16, 185, 129, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'float-slow': 'float 8s ease-in-out infinite',
        'float-reverse': 'floatRev 10s ease-in-out infinite',
        'liquid-wave': 'wave 6s cubic-bezier(0.36, 0.45, 0.63, 0.53) infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg) scale(1)' },
          '50%': { transform: 'translateY(-16px) rotate(3deg) scale(1.03)' },
        },
        floatRev: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg) scale(1)' },
          '50%': { transform: 'translateY(18px) rotate(-3deg) scale(0.97)' },
        },
        wave: {
          '0%, 100%': { transform: 'translateX(0) translateZ(0) scaleY(1)' },
          '50%': { transform: 'translateX(-25%) translateZ(0) scaleY(1.15)' },
        },
      },
    },
  },
  plugins: [],
}
