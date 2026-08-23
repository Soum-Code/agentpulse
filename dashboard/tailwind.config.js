/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Surfaces
        void: '#05060b',
        surface: {
          DEFAULT: '#0a0c14',
          2: '#0f121c',
          3: '#151926',
        },
        line: {
          DEFAULT: '#1e2333',
          strong: '#2b3247',
        },
        ink: {
          DEFAULT: '#e8ecf5',
          dim: '#9aa4bd',
          faint: '#5d6782',
        },
        // Brand signal — identity and interaction only, never state.
        signal: {
          DEFAULT: '#22d3ee',
          dim: '#0e7490',
          deep: '#083344',
        },
        // Semantic state — risk and health only, never decoration.
        state: {
          ok: '#34d399',
          warn: '#fbbf24',
          bad: '#fb7185',
          crit: '#f43f5e',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.06em' }],
      },
      boxShadow: {
        signal: '0 0 26px -10px rgba(34, 211, 238, 0.35)',
        lift: '0 12px 28px -18px rgba(0, 0, 0, 0.9)',
      },
    },
  },
  plugins: [],
}
