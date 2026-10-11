import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Só os testes do CLI: o `template/` e a cópia temporária têm seus próprios testes.
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'template/**', 'test/.tmp-*/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
