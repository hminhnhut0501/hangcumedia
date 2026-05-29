import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#f7f4ef',
        ink: '#1f1b16',
        accent: '#0f766e'
      }
    }
  },
  plugins: []
};

export default config;
