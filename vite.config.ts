import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/.local/**', '**/reports/**', '**/test-results/**', '**/release/**'] },
  },
  build: { target: 'es2022' },
});
