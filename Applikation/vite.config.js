import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '/website': fileURLToPath(new URL('../Website', import.meta.url))
    }
  }
});
