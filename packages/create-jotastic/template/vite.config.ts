import { defineConfig } from 'vitest/config'
import jotastic from '@jotastic/vite'

export default defineConfig({
  // Compila os `.tsx` (signals e bindings por nó). Em `npm run dev` também injeta o @jotastic/devtools.
  plugins: [jotastic()],
  build: {
    target: 'es2022',
  },
  test: {
    environment: 'happy-dom',
  },
})
