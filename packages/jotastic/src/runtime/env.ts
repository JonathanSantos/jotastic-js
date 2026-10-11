/**
 * Constante única de modo dev (regra 5 do guia: dev vs prod avaliado no build do usuário).
 *
 * O pacote publica dois builds (tsup.config.ts): `dist/dev` com `__DEV__ = true` e `dist/prod` com `__DEV__ = false`,
 * escolhidos por `exports` condicionais (`development` → dev, `default` → prod). No build de prod a constante vira o
 * literal `false` e os ramos `if (DEV)` somem por eliminação de código morto no bundler do usuário.
 * Rodando o fonte (Vitest, alias), `__DEV__` não existe: cai em `process.env.NODE_ENV` (sem `process` = dev).
 */
declare const __DEV__: boolean | undefined

export const DEV: boolean =
  typeof __DEV__ !== 'undefined'
    ? __DEV__
    : typeof process !== 'undefined'
      ? process.env.NODE_ENV !== 'production'
      : true
