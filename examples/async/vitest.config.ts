import { defineConfig } from 'vitest/config'
import jotastic from '@jotastic/vite'

// O usuário final testaria assim: o próprio plugin compila os `.tsx` importados pelos testes.
export default defineConfig({
  plugins: [jotastic()],
  test: {
    environment: 'happy-dom',
    // H-1 (21-pendencias): `form.nextSibling` null no happy-dom 15.
    setupFiles: ['../../packages/jotastic/test/setup/happy-dom-form.ts'],
  },
})
