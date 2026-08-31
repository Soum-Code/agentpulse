/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      xs: '420px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      '3xl': '1920px',
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Comic Ink & Lively Pop Dark Backdrop
        void: '#0c101d',
        surface: {
          DEFAULT: '#141b2d',
          2: '#1b243b',
          3: '#24304e',
          4: '#2f3e63',
        },
        line: {
          DEFAULT: 'rgba(255, 255, 255, 0.12)',
          strong: 'rgba(255, 255, 255, 0.22)',
          subtle: 'rgba(255, 255, 255, 0.06)',
          highlight: '#ffe600',
        },
        ink: {
          DEFAULT: '#f8fafc',
          dim: '#94a3b8',
          faint: '#64748b',
          dark: '#050811',
        },
        // Lively Comic Palette
        comic: {
          yellow: '#ffe600',
          yellowLight: '#fff275',
          cyan: '#00e5ff',
          cyanLight: '#6ff9ff',
          pink: '#ff3366',
          pinkLight: '#ff7092',
          green: '#00e676',
          greenLight: '#69f0ae',
          purple: '#a855f7',
          purpleLight: '#c084fc',
          orange: '#ff6d00',
          orangeLight: '#ff9e40',
          blue: '#3b82f6',
        },
        // Refined brand signal — Comic Gold & Electric Indigo
        signal: {
          DEFAULT: '#ffe600',
          glow: '#fff275',
          dim: '#eab308',
          deep: '#422006',
          faint: 'rgba(255, 230, 0, 0.12)',
        },
        // Pop comic accents
        accent: {
          yellow: '#ffe600',
          cyan: '#00e5ff',
          pink: '#ff3366',
          green: '#00e676',
          purple: '#a855f7',
          orange: '#ff6d00',
          blue: '#3b82f6',
          sky: '#38bdf8',
          violet: '#8b5cf6',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
        // Semantic state — High energy comic indicators
        state: {
          ok: '#00e676',
          warn: '#ffe600',
          bad: '#ff3366',
          crit: '#ff1744',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '24px',
        '3xl': '32px',
      },
      fontSize: {
        '4xs': ['8px', { lineHeight: '10px', letterSpacing: '0.1em' }],
        '3xs': ['9px', { lineHeight: '12px', letterSpacing: '0.08em' }],
        '2xs': ['11px', { lineHeight: '15px', letterSpacing: '0.05em' }],
      },
      boxShadow: {
        // Comic Solid Offset Shadows (Neo-Pop / Graphic Novel)
        comic: '3px 3px 0px 0px #000000',
        'comic-sm': '2px 2px 0px 0px #000000',
        'comic-lg': '5px 5px 0px 0px #000000',
        'comic-xl': '7px 7px 0px 0px #000000',
        'comic-yellow': '4px 4px 0px 0px #ffe600',
        'comic-cyan': '4px 4px 0px 0px #00e5ff',
        'comic-pink': '4px 4px 0px 0px #ff3366',
        'comic-green': '4px 4px 0px 0px #00e676',
        'comic-purple': '4px 4px 0px 0px #a855f7',
        'comic-orange': '4px 4px 0px 0px #ff6d00',
        signal: '0 4px 20px -2px rgba(255, 230, 0, 0.25)',
        'signal-lg': '0 8px 32px -4px rgba(255, 230, 0, 0.35)',
        lift: '0 12px 32px -8px rgba(0, 0, 0, 0.7)',
        glass: '0 20px 50px -10px rgba(0, 0, 0, 0.7)',
        card: '3px 3px 0px 0px rgba(0, 0, 0, 0.8), 0 4px 12px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'rise': 'rise 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pop': 'pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'wiggle': 'wiggle 1s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', filter: 'drop-shadow(0 0 4px rgba(255, 230, 0, 0.3))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 10px rgba(255, 230, 0, 0.7))' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.96)' },
          '100%': { transform: 'scale(1)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(-2deg)' },
          '50%': { transform: 'rotate(2deg)' },
        },
      },
    },
  },
  plugins: [],
};


