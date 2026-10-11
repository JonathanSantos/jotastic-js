import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    runtime: 'src/runtime/index.ts',
    store: 'src/store.ts',
    fetch: 'src/fetch.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  clean: true,
})
