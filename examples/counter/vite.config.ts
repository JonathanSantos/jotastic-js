import { defineConfig } from 'vite'
import jotastic from '@jotastic/vite'

export default defineConfig({
  plugins: [jotastic()],
  build: {
    // Navegadores com class fields nativos: evita os helpers `__publicField` do target padrão do Vite.
    target: 'es2022',
    // App de um chunk só: o polyfill de `modulepreload` do Vite (~265 B brotli) não tem o que pré-carregar.
    modulePreload: { polyfill: false },
  },
})
