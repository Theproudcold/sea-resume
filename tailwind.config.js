/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--ui-primary)',
        success: 'var(--ui-success)',
        warning: 'var(--ui-warning)',
        danger: 'var(--ui-danger)',
        info: 'var(--ui-info)',
        paper: { DEFAULT: 'var(--color-paper)', 2: 'var(--color-paper-2)', 3: 'var(--color-paper-3)' },
        ink: { DEFAULT: 'var(--color-ink)', 2: 'var(--color-ink-2)' },
        muted: 'var(--color-muted)',
        rule: 'var(--color-rule)',
        accent: { DEFAULT: 'var(--color-accent)', 2: 'var(--color-accent-2)' },
      },
    },
  },
  plugins: [],
}

