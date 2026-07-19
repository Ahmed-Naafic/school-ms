// Theme values match docs/02-standards/UI-UX-Standards.md exactly, including
// its Dark Mode section. Do not add a color, font size, spacing, radius, or
// shadow value here without updating that document first (UI/UX Principle #9).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#0d1f30',
          900: '#14304a',
          800: '#1b3a5c',
          700: '#24507c',
          100: '#dbe5ee',
          50: '#eef3f7',
        },
        teal: {
          700: '#1e807e',
          600: '#249a98',
          500: '#2ca6a4',
          100: '#d9f0ef',
          50: '#edf8f7',
        },
        amber: {
          600: '#cf8b28',
          500: '#e9a23b',
          100: '#fbeedb',
        },
        gray: {
          900: '#23303c',
          700: '#47555f',
          500: '#7b8790',
          400: '#98a4ac',
          300: '#c3ccd2',
          200: '#dde3e7',
          100: '#eef1f3',
          50: '#f7f9fa',
        },
        success: { DEFAULT: '#24906a', bg: '#e2f3ec' },
        warning: { DEFAULT: '#cf8b28', bg: '#fbeedb' },
        danger: { DEFAULT: '#cf4444', bg: '#fae5e5' },
        info: { DEFAULT: '#24507c', bg: '#eef3f7' },
      },
      fontFamily: {
        display: ['Quicksand', 'Trebuchet MS', 'sans-serif'],
        body: ['Nunito Sans', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        xs: '12px',
        sm: '13.5px',
        base: '15px',
        md: '17px',
        lg: '20px',
        xl: '25px',
        '2xl': '32px',
        '3xl': '42px',
        '4xl': '56px',
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '24px',
        6: '32px',
        7: '48px',
        8: '64px',
        9: '96px',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '18px',
        pill: '999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(13, 31, 48, 0.06)',
        md: '0 4px 12px rgba(13, 31, 48, 0.08)',
        lg: '0 12px 32px rgba(13, 31, 48, 0.14)',
      },
      maxWidth: {
        container: '1120px',
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
      },
      transitionTimingFunction: {
        'out-brand': 'cubic-bezier(0.2, 0.8, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
