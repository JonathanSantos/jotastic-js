# 14 — Roadmap

Objetivo do MVP: **provar que dá para escrever uma app real em TSX puro, sem hooks, com performance igual ou melhor que o Solid e DX melhor que o React.**

## API do MVP

| Núcleo (`jotastic`) | JSX | Outros |
|---|---|---|
| `mount` | `ref`, `key` | `jotastic/store`: `createStore`, `$snapshot`, `$reset` |
| `watch`, `on`, `external` | `class`/`style` objeto | `jotastic/fetch`: `fetch` com signal ambiente |
| `onMount`, `onCleanup` | `innerHTML`, `hidden` | |
| `untrack`, `tick`, `raw`, `inspect` | `on:custom` | |
| `pending`, `refresh`, `abortSignal` | | |
| `<Boundary>`, `<Portal>`, `<Slot>` + `useSlots` | | |

Dezoito itens, sem sintaxe nova no JSX. Funções `use*` não são API: são o compilador.

## Fase 2 (já desenhado, fora do MVP)

| Item | Onde está o desenho |
|---|---|
| `createContext`, `expose` + `ref` em componente, diretivas `use:`, `useChildren` | [02](02-componentes.md) |
| `reconcile()` opt-in, `signal`/`memo` públicos documentados | [03](03-estado-e-derivados.md), [11](11-runtime.md) |
| `keep:alive`, `transition:` | [06](06-controle-de-fluxo.md) |
| `try/catch` em `await`, `cached`/`invalidate`, transições async | [07](07-async.md) |
| `@jotastic/form` (a receita `useForm` dos exemplos publicada) | [examples/14-use-form.ts](examples/14-use-form.ts) |
| `$subscribe`, `persist`, `history`, `sync`, `defineStore` com escopo | [08](08-store.md) |
| Router tipado | [16](16-router.md) |
| Devtools fases 2 e 3 | [13](13-tooling.md) |
| HMR preservando `let` (flag) | [13](13-tooling.md) |
| SSR / hydration / ilhas | templates como HTML string já são compatíveis |
| CSS com escopo, forms de primeira classe | [refinement/07](../refinement/07-ideias-de-inovacao.md) |

## Marcos

| Marco | Entrega | Pronto quando |
|---|---|---|
| **M0 — Fundação** | Monorepo npm workspaces, CI, lint, Vitest, medição de tamanho | `npm test` passa no CI |
| **M1 — Runtime** | implementação própria de signals, owner com `context`, `reactive`, `template`/`insert`/`attr`/`branches`/`list`/`listen`; **os seis arquivos de [compiled/](compiled/README.md) rodam** | testes R/P/D/F/E de [19](19-plano-de-testes.md) passam |
| **M2 — Analyzer + JSX estático** | `@jotastic/analyzer` com classificação e diagnósticos; compilador gera template + `mount` | `<div class="a"><b>oi</b></div>` renderiza; fixtures de diagnóstico passam |
| **M3 — Reatividade compilada** | `let`/`const`/props/eventos/`value`/`checked` two-way/`ref`/`on` lazy; **benchmark no CI**; **overlay de flash** | Counter executa 1 vez; js-framework-benchmark roda |
| **M4 — Controle de fluxo** | condicionais, early return, listas, objetos reativos, funções `use*` | TodoMVC e contratos de [06](06-controle-de-fluxo.md) passam |
| **M5 — Store, erros, app** | `createStore`, `mount` com opções, `<Boundary>` (erros), `<Portal>`, `<Slot>`/`useSlots`, `inspect`, `@jotastic/test` | exemplo de carrinho + modal + card com slots funciona; handlers roteiam erros |
| **M6 — DX** | ESLint plugin, sourcemaps, HMR, `create-jotastic`, devtools "Atualizações", overlay de erro, Alt+clique abre no editor, auto-import opcional, `llms.txt` | dev novo cria app em < 5 min; avisos aparecem no editor |
| **M7 — Async** | `await` no componente, `<Boundary pending>`, `pending`/`refresh`, `abortSignal` ambiente, `jotastic/fetch` | tela com fetch sem `watch` manual e sem `signal` no componente |
| **M8 — Validação** | Benchmarks finais + teste com devs | critérios abaixo |

Estratégia: **runtime primeiro** (M1 com saídas compiladas à mão, que viram snapshots), fatia vertical cedo (`create` → Vite → Counter → overlay), benchmark e tamanho no CI desde o M3.

## Estrutura do repositório

```
jotastic/
├─ packages/
│  ├─ jotastic/         # runtime + API pública + store + tipos JSX
│  ├─ analyzer/
│  ├─ compiler/
│  ├─ vite/
│  ├─ eslint-plugin/
│  ├─ devtools/
│  ├─ test/
│  └─ create-jotastic/
├─ examples/            # counter, todomvc, cart, async, benchmark (cada um com testes de contagem)
├─ docs/
│  ├─ spec/             # esta spec
│  └─ refinement/       # histórico
└─ package.json          # "workspaces": ["packages/*", "examples/*"]
```

Stack: npm workspaces, TypeScript, Vitest + happy-dom, Playwright, Babel (MVP).

## Critérios de sucesso

**Técnicos**
- TodoMVC sem nenhum `useX`, `signal()` ou `()` de leitura no código do usuário.
- Teste automatizado prova: alterar um item executa **só** os bindings daquele item.
- js-framework-benchmark: ≤ Solid + 10%; tamanho ≤ Solid.
- Zero avisos do ESLint nos exemplos oficiais.

**De experiência**
- 3 a 5 devs React fazem a mesma tarefa (lista + filtro + formulário) em React e em Jotastic.
- Medir tempo, bugs e "o que surpreendeu?".
- Sinal positivo: nenhuma surpresa causada por "o componente roda uma vez" que o compilador não tenha avisado no editor.
