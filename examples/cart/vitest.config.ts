import { defineConfig } from 'vitest/config'
import jotastic from '@jotastic/vite'

// O usuário final testaria assim: o próprio plugin compila os `.tsx` importados pelos testes.
export default defineConfig({
  plugins: [jotastic()],
  test: {
    environment: 'happy-dom',
  },
})
