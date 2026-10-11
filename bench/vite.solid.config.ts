import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  root: 'src/solid',
  base: './',
  plugins: [solid()],
  build: { outDir: '../../dist/solid', emptyOutDir: true, target: 'es2022', modulePreload: { polyfill: false } },
})
