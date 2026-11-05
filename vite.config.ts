import { defineConfig } from 'vite-plus';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: 'automatic' } },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
  preview: { port: 4173 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
