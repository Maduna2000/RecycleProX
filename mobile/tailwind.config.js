/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#1B2A4A',
          green: '#4CAF50',
          'green-light': '#6EC072',
          blue: '#2563EB',
          'blue-light': '#3B82F6',
        },
      },
    },
  },
  plugins: [],
};
