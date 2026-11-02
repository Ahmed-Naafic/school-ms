import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Backend runs on port 4000 by default, per backend/src/config/env.js.
      '/api': 'http://localhost:4000',
    },
  },
});
