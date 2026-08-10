/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#0B3C3D',
          DEFAULT: '#0F4C4D',
          light: '#1A6B6D',
        },
        accent: {
          DEFAULT: '#F58634',
          hover: '#D96E22',
        },
        surface: '#F7FAFA',
        muted: '#64748B',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
