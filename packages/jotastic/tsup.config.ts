import { defineConfig, type Options } from 'tsup'

// Dois builds (regra 5 do guia, 21-pendencias V-1): `dist/dev` (`__DEV__ = true`) e `dist/prod` (`__DEV__ = false`).
// `package.json#exports` escolhe pela condição `development` (dev) / `default` (prod). Os tipos saem no de prod.
const base: Options = {
  entry: {
    index: 'src/index.ts',
    runtime: 'src/runtime/index.ts',
    // Subpath interno de HMR (D65): só o rodapé que o compilador emite em dev importa. Em prod é no-op.
    'runtime/hmr': 'src/runtime/hmr.ts',
    store: 'src/store.ts',
    fetch: 'src/fetch.ts',
  },
  format: ['esm'],
  splitting: true,
  clean: true,
  external: ['jotastic/jsx-runtime'],
}

export default defineConfig([
  { ...base, outDir: 'dist/dev', define: { __DEV__: 'true' } },
  // Prod: `minifySyntax` faz o esbuild inlinar `DEV` como literal `false` em todo uso (também entre módulos) e dobrar
  // os ramos de dev; sem isso o bundler do usuário vê só `var DEV = false` e nem sempre elimina (ternários em
  // argumentos sobrevivem ao Rollup e ao minificador do Vite). Nomes e espaços continuam legíveis.
  { ...base, outDir: 'dist/prod', define: { __DEV__: 'false' }, minifySyntax: true, dts: true },
])
