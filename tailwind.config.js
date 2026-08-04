/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#090a0f',
        surface: '#12141d',
        surfaceBorder: '#1e2230',
        card: '#181b26',
        cardHover: '#202433',
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        accent: {
          green: '#10b981',
          orange: '#f59e0b',
          purple: '#8b5cf6',
          rose: '#f43f5e',
        }
      }
    },
  },
  plugins: [],
}
