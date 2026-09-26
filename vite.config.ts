import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Fabric.js alone is ~300 kB minified; a design tool bundle is expected to be large.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
