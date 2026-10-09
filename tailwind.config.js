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
      },
    },
  },
  plugins: [],
}

