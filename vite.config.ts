import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  // opencascade.js ships a ~30 MB .wasm; let Vite treat it as a static asset
  // (we import it with `?url`) rather than trying to pre-bundle it.
  optimizeDeps: { exclude: ['opencascade.js'] },
})
