import { defineConfig } from 'vite'
import jotastic from '@jotastic/vite'

export default defineConfig({
  plugins: [jotastic()],
  build: {
    // Mesmo alvo do counter: class fields nativos, sem polyfill de `modulepreload`.
    target: 'es2022',
    modulePreload: { polyfill: false },
  },
})
