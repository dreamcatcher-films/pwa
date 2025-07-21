/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-dark-green': '#0F3E34',
      },
      fontFamily: {
        'sans': ['Rubik', 'sans-serif'],
        'cinzel': ['Cinzel', 'serif'],
      },
      keyframes: {
        'modal-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-out': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        'slide-in-bottom': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'draw-ring': {
          'to': { 'stroke-dashoffset': '0' },
        }
      },
      animation: {
        'modal-in': 'modal-in 0.2s ease-out forwards',
        'slide-in': 'slide-in 0.3s ease-out forwards',
        'slide-out': 'slide-out 0.3s ease-out forwards',
        'slide-in-bottom': 'slide-in-bottom 0.3s ease-out forwards',
        'draw-ring': 'draw-ring 1.5s ease-out forwards infinite',
      }
    },
  },
  plugins: [],
}
