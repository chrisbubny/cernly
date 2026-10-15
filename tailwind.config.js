/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Cernly brand
        teal: {
          DEFAULT: '#00D4AA',
          50:  '#e6faf7',
          100: '#b3f0e7',
          200: '#66e0cf',
          300: '#33d4bd',
          400: '#00D4AA',
          500: '#00b893',
          600: '#009b7c',
          700: '#007d64',
        },
        purple: {
          DEFAULT: '#A78BFA',
          400: '#A78BFA',
          500: '#8B6EF7',
          600: '#7C3AED',
        },
        // Dark palette
        base: {
          950: '#050B14',
          900: '#080C14',  // body bg
          800: '#0D1526',  // card bg
          700: '#131E30',  // elevated card
          600: '#1A2740',  // border-ish
          500: '#243352',  // subtle border
          400: '#8899B5',  // muted text
          300: '#A8B8CE',  // secondary text
          200: '#C8D5E6',  // body text
          100: '#E8EFF7',  // primary text
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #00D4AA, #A78BFA)',
        'brand-gradient-r': 'linear-gradient(135deg, #A78BFA, #00D4AA)',
        'card-gradient': 'linear-gradient(135deg, rgba(0,212,170,0.08), rgba(167,139,250,0.08))',
      },
      boxShadow: {
        'glow-teal':   '0 0 30px rgba(0,212,170,0.25)',
        'glow-purple': '0 0 30px rgba(167,139,250,0.2)',
        'card':        '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in':  'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
