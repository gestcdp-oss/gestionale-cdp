/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // bianco panna (superfici)
        panna: '#FBF7EE',
        // azzurino pastello (tema, stile Windows/Fluent morbido)
        cielo: {
          50: '#F3F8FC',
          100: '#E6F0F8',
          200: '#CFE2F0',
          300: '#AECDE6',
          400: '#88B4D8',
          500: '#6AA0CC',
          600: '#5288B7',
          700: '#426E96',
          800: '#37596F',
        },
      },
    },
  },
  plugins: [],
}
