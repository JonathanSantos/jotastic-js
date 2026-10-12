# 13 — Tooling

## Pacotes

| Pacote | Conteúdo |
|---|---|
| `jotastic` | API pública (`mount`, `watch`, `on`, `external`, …), `jotastic/store`, `jotastic/runtime`, `jotastic/jsx-runtime` (tipos) |
| `@jotastic/analyzer` | Classificação + diagnósticos (puro) |
| `@jotastic/compiler` | Plugin Babel (MVP) |
| `@jotastic/vite` | Plugin Vite: compiler, HMR, devtools em dev |
| `@jotastic/eslint-plugin` | Regras do analyzer com autofix no editor |
| `@jotastic/devtools` | Painel embutido |
| `@jotastic/test` | `render`, `tick`, contador de execuções |
| `@jotastic/router` | Fase 2 ([16](16-router.md)) |
| `create-jotastic` | `npm create jotastic` |

## Vite

```ts
// vite.config.ts
import jotastic from '@jotastic/vite'
export default { plugins: [jotastic({ devtools: true })] }
```

```jsonc
// tsconfig.json
{ "compilerOptions": { "jsx": "preserve", "jsxImportSource": "jotastic", "strict": true } }
```

Tipos JSX: atributos HTML tipados (nomes do React em camelCase e do HTML), `class`/`for`, `on:*`, `ref`, `key`, `e.currentTarget` tipado por elemento, `Slot`/`useSlots` tipados por nome.

Opções do plugin: `devtools` (padrão em dev), `hmr.preserveState`. `autoImport` fica para a fase 2.

## ESLint

```js
// eslint.config.js
import jotastic from '@jotastic/eslint-plugin'
export default [jotastic.configs.recommended]
```

Mesmos IDs e autofixes do compilador ([12](12-diagnosticos.md)). `recommended` inclui também `prefer-const` desligado para corpos reativos (o compilador já cuida disso com `let-never-reassigned`).

## `npm create jotastic`

Template mínimo: Vite + TS + ESLint + um `Counter` + `@jotastic/test` configurado. Meta: dev novo roda a app em < 5 minutos.

## HMR

- **Overlay de erro do Vite** mostra os diagnósticos de compilação com a mesma mensagem e sugestão do editor.
- **Alt+clique abre no editor**: em dev o elemento raiz de cada componente recebe `data-jo="UserCard.tsx:12"`, e o devtools (ou o atalho) abre o arquivo na linha.
- **M6:** ao salvar, o módulo é recarregado e os componentes afetados remontados. Stores de módulo **preservam** o estado. `let` locais preservam o valor **só se o inicializador não mudou** (hash do código do inicializador), atrás da flag `hmr: { preserveState: true }`; o console lista o que foi preservado e o que resetou. `// @refresh reset` no topo do arquivo força reset.
- Lição do Svelte (`@hmr:keep` abandonado): preservar por nome sem verificar o inicializador é imprevisível.

## Devtools

Painel flutuante na página, sem extensão, só em dev (`Alt+J`). Feito com o próprio Jotastic em Shadow DOM.

| Fase | Painel |
|---|---|
| **Logo após o M3** | **Atualizações** ("por que isso mudou?": causa → derivados → nós, com arquivo e linha, e o que os guards evitaram) + **overlay de flash** nos nós atualizados + contadores de execução + Alt+clique para abrir no editor + lista dos `inspect` ativos |
| Fase 2 | **Componentes** (árvore de owners, estado editável ao vivo, branches, recursos) + **Stores** (histórico de ações com diff, time travel, `$reset`, import/export) |
| Fase 3 | **Async** (recursos, status, deps, simular loading/erro/latência) + **Performance** (alertas de `binding-hot`, `memo-never-read`, `signal-never-set`) |

Como funciona: o compilador injeta `name`/`loc` em dev; o runtime emite eventos em `globalThis.__JOTASTIC_DEVTOOLS__` (`owner:*`, `signal:set`, `memo:run/skip`, `effect:run`, `dom:write`, `resource:*`, `store:action`, `list:recreated`). Em prod nada disso existe.

## Testes (`@jotastic/test`)

```ts
import { render, tick, counts } from '@jotastic/test'

const { container, unmount } = render(<Counter label="x" />)
container.querySelector('button')!.click()
await tick()
expect(container.textContent).toContain('x: 1')
expect(counts()).toMatchObject({ effects: 1, memos: 1 })     // prova: só 1 efeito rodou
```

Roda em `happy-dom`/`jsdom` com Vitest. Os exemplos oficiais usam exatamente isso.

## CI

- `npm test` (Vitest) + Playwright nos exemplos.
- Tamanho por cenário (brotli) com limiares: counter, TodoMVC, todas as features.
- js-framework-benchmark a partir do M3 com limiar ≤ Solid + 10%.
