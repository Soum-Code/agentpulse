/** @type {import('tailwindcss').Config} */
// Tailwind CSS v3. Do not migrate to v4 — a prior attempt introduced v4-only
// CSS into this project and broke the production build.
//
// theme.extend is intentionally empty: the old token palette was removed in the
// frontend clean-slate reset, and the replacement belongs to the next phase.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
