/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Heebo', 'system-ui', 'sans-serif'] },
      colors: {
        ink: '#0E0F12',
        mist: '#ECEDF3',
        haze: '#F6F6FA',
        accent: { DEFAULT: '#1F4BFF', soft: '#E3E8FF' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,15,18,.04), 0 8px 24px -8px rgba(14,15,18,.10)',
        float: '0 12px 40px -12px rgba(14,15,18,.35)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
};
