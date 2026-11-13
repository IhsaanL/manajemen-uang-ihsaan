/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './assets/js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: '#F6F7F4',
        ink: '#111315',
        surface: '#FFFFFF',
        line: '#E5E7EB',
        forest: '#10B981',
        amber: '#F59E0B',
        coral: '#EF4444',
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 16px 45px -30px rgba(17, 19, 21, 0.35)',
        card: '0 1px 2px rgba(17, 19, 21, 0.02), 0 18px 50px -38px rgba(17, 19, 21, 0.32)',
        lift: '0 22px 60px -28px rgba(17, 19, 21, 0.35)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-up': 'fadeUp .42s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fadeIn .25s ease-out both',
        'pop': 'pop .32s cubic-bezier(.22,1,.36,1) both',
        'pulse-soft': 'pulseSoft 2.8s ease-in-out infinite',
        'shake': 'shake .45s cubic-bezier(.36,.07,.19,.97) both',
        'float': 'float 5s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(.96) translateY(8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '.55', transform: 'scale(1)' },
          '50%': { opacity: '.9', transform: 'scale(1.04)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-2px)' },
          '20%, 80%': { transform: 'translateX(4px)' },
          '30%, 50%, 70%': { transform: 'translateX(-7px)' },
          '40%, 60%': { transform: 'translateX(7px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(-2deg)' },
          '50%': { transform: 'translateY(-7px) rotate(1deg)' },
        },
      },
    },
  },
  plugins: [],
};
