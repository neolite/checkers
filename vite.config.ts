import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { saveConfigPlugin } from './_utils/inspector/save-config-plugin';

export default defineConfig({
  plugins: [saveConfigPlugin()],
  resolve: {
    alias: {
      '@config': fileURLToPath(new URL('./src/config', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url)),
      '@entities': fileURLToPath(new URL('./src/entities', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@vfx': fileURLToPath(new URL('./src/vfx', import.meta.url)),
      '@systems': fileURLToPath(new URL('./src/systems', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@scenes': fileURLToPath(new URL('./src/scenes', import.meta.url)),
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: false },
});
