# 20 — Guia de implementação

Para a sessão que vai implementar. Ordem obrigatória, com definição de pronto por passo. Toda decisão de design já está tomada: na dúvida, o `.d.ts` em [contracts/](contracts/) vence a prosa, e a prosa vence a intuição.

## Ferramentas

| Item | Escolha |
|---|---|
| Monorepo | npm workspaces (`"workspaces": ["packages/*", "examples/*"]` no `package.json` raiz); npm 10+ |
| Linguagem | TypeScript 5.5+, `strict`, `verbatimModuleSyntax`, ESM only |
| Build | `tsup` por pacote (`dts: true`, `sideEffects: false`, `splitting: false`) |
| Testes | Vitest + `happy-dom`; `@jotastic/test` para os exemplos |
| Compilador | `@babel/core`, `@babel/parser` (`jsx`, `typescript`), `@babel/traverse`, `@babel/generator`, `@babel/types`; sem `@babel/preset-*` |
| Vite | plugin com `enforce: 'pre'`, `transform` para `.tsx`/`.ts` (só arquivos com corpos reativos, detectados pelo analyzer) |
| Lint do repo | ESLint flat config + Prettier (sem ponto e vírgula, aspas simples, 120 colunas) |
| CI | GitHub Actions: `npm ci && npm run build && npm test && npm run size` |

Scripts na raiz: `dev` (vite nos exemplos), `build`, `test`, `test:watch`, `size`, `bench`, `lint`. Scripts por pacote rodam com `npm run <script> -w packages/<nome>`; `build` e `test` da raiz usam `--workspaces`.

## Passo 0 — Fundação (M0)

Criar: `package.json` raiz com `workspaces`, `tsconfig.base.json`, pacotes vazios `packages/jotastic`, `packages/analyzer`, `packages/compiler`, `packages/vite`, `packages/test`, `examples/counter`. CI verde com um teste trivial.

**Pronto quando:** `npm test` passa no CI.

## Passo 1 — Núcleo reativo (M1a)

Arquivos: `runtime/reactive.ts`, `runtime/owner.ts`, `runtime/devtools.ts`. Implementar **exatamente** [contracts/runtime.d.ts](contracts/runtime.d.ts) §Núcleo e §Owner, com a semântica de [17 §Scheduler](17-contratos.md#scheduler).

Decisão: implementação própria (push-pull com DIRTY/CHECK, ~300 linhas). Não usar `alien-signals` agora; a fachada permite trocar depois.

**Pronto quando:** R1–R20 de [19](19-plano-de-testes.md) passam.

## Passo 2 — Objetos reativos (M1b)

`runtime/proxy.ts`. **Pronto quando:** P1–P13 passam.

## Passo 3 — DOM e fluxo (M1c)

`runtime/dom.ts`, `runtime/flow.ts`, `runtime/external.ts`, `runtime/props.ts`, `runtime/root.ts`. Depois, `packages/jotastic/test/compiled/`: copiar os arquivos de [compiled/](compiled/README.md) (ajustando imports) e fazê-los rodar: Counter clica e atualiza; Todos adiciona/edita/filtra; UserPage alterna; Card com slots.

**Pronto quando:** D1–D13, F1–F16, E1–E5 passam **e** os seis arquivos compilados à mão rodam em happy-dom com as contagens da tabela de [19 §Compilador](19-plano-de-testes.md#compilador-m2).

## Passo 4 — Analyzer (M2a)

`packages/analyzer/src/`: `bodies.ts` (detecção), `scope.ts` (bindings, contexto vivo), `classify.ts`, `flow.ts`, `jsx.ts` (`attributeKind`, `eventName`, `normalizeAttribute`), `diagnostics.ts`. Função pura `analyze(ast, options)`.

**Pronto quando:** `classify.test.ts`, `flow.test.ts` e um fixture por diagnóstico passam.

## Passo 5 — Compilador (M2b–M4)

`packages/compiler/src/`: `index.ts` (plugin Babel), `emit/template.ts` (§5), `emit/bindings.ts` (§4, §5.3–5.6), `emit/components.ts` (§6, §12), `emit/flow.ts` (§7–§10), `emit/use.ts` (§11), `emit/module.ts` (§13–§14). Ordem de implementação: JSX estático → bindings → props/componentes → eventos/two-way → condicionais → listas → early return → `use*` → slots → `await` (M7).

**Pronto quando:** os snapshots de [compiled/](compiled/README.md) batem (modulo nomes de variáveis temporárias, normalizados pelo teste) e os testes de comportamento passam.

## Passo 6 — Vite, exemplos, test (M3–M5)

`packages/vite`, `packages/test` (`render`, `tick`, `counts`), `examples/counter`, `examples/todomvc`, `examples/cart` rodando no browser. Overlay de flash: `packages/devtools/src/flash.ts` (ouve `dom:write`, desenha um retângulo que some em 300 ms). Benchmark local em `bench/`.

**Pronto quando:** `npm run dev` abre os exemplos; `npm run size` e `npm run bench` rodam no CI.

## Passo 7 — Store, Boundary, Portal, Slots públicos (M5)

`store.ts`, `index.ts` completo. **Pronto quando:** S1–S6 passam e `examples/cart` + modal funcionam.

## Passo 8 — DX (M6)

`packages/eslint-plugin` (reusa o analyzer; regras = IDs; `fix` do diagnóstico vira `fixer.replaceTextRange`), sourcemaps verificados em stack trace, HMR (remontar preservando stores), `create-jotastic`, overlay de erro do Vite com a mensagem do diagnóstico.

## Passo 9 — Async (M7)

`runtime/async.ts`, `fetch.ts`, emissão §10. **Pronto quando:** A1–A9 passam e `examples/async` funciona.

## Regras para a implementação

1. **Não invente API.** Se algo parecer faltar, anote em `docs/spec/21-pendencias.md` com o caso concreto e siga com a solução mais simples que respeite os contratos.
2. **Cada função pública do runtime nasce com teste** do plano. Sem teste, não existe.
3. **Legibilidade da saída compilada é requisito**: nomes `_t0`, `_el`, `_m0`, imports nomeados, sem IIFEs desnecessárias.
4. **Zero dependências em runtime** (`packages/jotastic` não importa nada).
5. **Dev vs prod** por `import.meta.env.DEV` / `process.env.NODE_ENV`, avaliado no build do usuário (o pacote publica os dois entrypoints via `exports` condicionais `development`/`default`).
6. **Erros com `loc` sempre**; mensagens no formato de [12 §Formato](12-diagnosticos.md#formato).
7. Commits pequenos por passo, com o ID dos testes que passaram na mensagem.
