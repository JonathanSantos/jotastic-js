import { fileURLToPath } from 'node:url'

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}`, import.meta.url))

/** Aliases para os testes rodarem contra o código-fonte (sem build). */
export const alias = [
  { find: /^jotastic\/runtime$/, replacement: src('jotastic/src/runtime/index.ts') },
  { find: /^jotastic\/store$/, replacement: src('jotastic/src/store.ts') },
  { find: /^jotastic\/fetch$/, replacement: src('jotastic/src/fetch.ts') },
  { find: /^jotastic$/, replacement: src('jotastic/src/index.ts') },
  { find: /^@jotastic\/analyzer$/, replacement: src('analyzer/src/index.ts') },
  { find: /^@jotastic\/compiler$/, replacement: src('compiler/src/index.ts') },
  { find: /^@jotastic\/test$/, replacement: src('test/src/index.ts') },
]
