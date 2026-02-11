import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/toadz-coston/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
