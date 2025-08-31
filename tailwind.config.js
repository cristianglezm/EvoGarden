/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(120, 100%, 15%)', // Dark Green for header
        surface: {
          DEFAULT: 'green',
          hover: 'hsl(0, 0%, 25%)',
        },
        primary: {
          DEFAULT: 'hsl(90, 60%, 80%)',     // Light green text
          light: 'hsl(90, 70%, 90%)',
        },
        secondary: 'hsl(90, 50%, 70%)',   // Muted light green text
        tertiary: 'lightgreen',
        border: 'lime',
        chart: {
          background: 'hsl(120, 35%, 22%)',
          border: 'hsl(120, 35%, 35%)',
          grid: 'hsl(120, 10%, 45%)',
        },
        accent: {
          DEFAULT: 'lightgreen',
          blue: 'hsl(221, 83%, 60%)',
          purple: 'hsl(273, 80%, 65%)',
          yellow: 'hsl(45, 93%, 47%)',
          green: 'hsl(120, 100%, 50%)',
          red: 'hsl(0, 100%, 50%)',
        },
      }
    },
  },
  plugins: [],
}
