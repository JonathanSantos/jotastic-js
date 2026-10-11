import { defineConfig } from 'vite'
import jotastic from '@jotastic/vite'

export default defineConfig({
  root: 'src/jotastic',
  base: './',
  plugins: [jotastic()],
  build: { outDir: '../../dist/jotastic', emptyOutDir: true, target: 'es2022', modulePreload: { polyfill: false } },
})
