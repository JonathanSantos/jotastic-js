# 05 — Escopo do MVP

Objetivo do MVP: **provar que dá para escrever uma app real em TSX puro, sem hooks, com performance igual ou melhor que React, e que a experiência é melhor.**

## Entra no MVP

### Compilador
- [ ] Detecção de componentes (PascalCase + retorna JSX)
- [ ] `let` → signal, `const` derivado → computed
- [ ] Props desestruturadas → getters (com valores padrão)
- [ ] JSX → template + bindings (texto, atributos, `class`, `style`)
- [ ] Eventos (`onX`) com delegação
- [ ] Condicionais (`? :` e `&&`)
- [ ] Listas (`.map`) com `key` opcional
- [ ] `ref={x}` e `bind:value` / `bind:checked`
- [ ] Componentes filhos e `children`
- [ ] Fragmentos `<>...</>`
- [ ] Early return reativo (`if/else`, `switch`) — ver [09](09-condicionais.md)
- [ ] `key` em componentes, `hidden`
- [ ] `ref` em componentes + `expose()`, spread de props com getters
- [ ] Diagnósticos (`unsupported-return-position` etc.)
- [ ] Sourcemaps + metadados de dev (`name`, `loc`) para o devtools

### Runtime
- [ ] `signal`, `computed`, `watch`, `batch`, `untrack`
- [ ] `store` com proxy profundo e lazy
- [ ] Proteção por valor: reconcile na substituição de objetos + comparação rasa em derivados + `raw()` — ver [04](04-runtime.md)
- [ ] `onMount`, `onCleanup`, owner tree (atualizações de cima para baixo)
- [ ] `template`, `text`, `attr`, `insert`, `branches`, `list`, `delegate`
- [ ] `mount` + `createApp` (`.use`, `.onError`) — ver [08](08-bootstrap-e-componentes.md)
- [ ] `<Catch>`

### Store (`jotastic/store`)
- [ ] `createStore((set, get) => ...)` com as 3 formas de `set` — ver [10](10-store.md)
- [ ] `$subscribe`, `$snapshot`, `$reset`
- [ ] Middleware `persist`

### Tooling
- [ ] Plugin Vite (`@jotastic/vite`)
- [ ] Tipos JSX (`jsxImportSource: "jotastic"`) com atributos HTML tipados
- [ ] Template inicial: `npm create jotastic`
- [ ] HMR básico (recarrega o módulo e remonta o componente; perder estado é aceitável no MVP)

### Exemplos (a validação de verdade)
- [ ] Counter
- [ ] TodoMVC completo
- [ ] Formulário com validação
- [ ] Lista grande (10k linhas) para benchmark
- [ ] Uma tela real com fetch + loading + erro (usando `await` no componente)

## Fica fora do MVP

| Item | Por quê |
|---|---|
| SSR / hydration | Grande e ortogonal à validação da ideia |
| Router | Usar um router simples no exemplo; router oficial depois |
| Context / stores com escopo | `createStore` em módulo resolve o MVP |
| `cached()` (cache global de async) | Depois do `await` básico (D12) |
| Transições/animações | Pós-MVP |
| `keep:alive` | `hidden` nativo cobre a maioria dos casos de "preservar estado" (D14) |
| Devtools fases 2 e 3 | MVP tem só o painel de Atualizações + overlay (ver [12](12-devtools.md)) |
| HMR preservando estado | Pós-MVP |
| Compilador em Rust | Babel é suficiente para validar |

## Estrutura do repositório (proposta)

```
jotastic/
├─ packages/
│  ├─ runtime/          # jotastic (signals + DOM)
│  ├─ compiler/         # @jotastic/compiler (Babel plugin)
│  ├─ store/            # jotastic/store (mini Zustand)
│  ├─ devtools/         # @jotastic/devtools
│  ├─ vite-plugin/      # @jotastic/vite
│  └─ create-jotastic/  # scaffolding
├─ examples/
│  ├─ counter/
│  ├─ todomvc/
│  └─ benchmark/
├─ docs/
│  └─ refinement/
└─ pnpm-workspace.yaml
```

Stack: pnpm workspaces, TypeScript, Vitest + happy-dom, Playwright para e2e dos exemplos.

## Marcos

| Marco | Entrega | Pronto quando |
|---|---|---|
| **M0 — Fundação** | Monorepo, CI, lint, Vitest | `pnpm test` passa no CI |
| **M1 — Signals** | `signal`/`computed`/`watch`/`batch`/owner | Testes de glitch-free, batching e contagem de execuções |
| **M2 — JSX estático** | Compilador gera template + `mount` | `<div class="a"><b>oi</b></div>` renderiza |
| **M3 — Reatividade compilada** | `let`/`const`/props/eventos | Counter funciona e o componente executa **1 vez** |
| **M4 — Controle de fluxo** | Condicionais, early return reativo, listas, `store` + reconcile | TodoMVC funciona e os testes de contrato de [09](09-condicionais.md) passam |
| **M5 — Store e app** | `createStore`, `createApp`, `<Catch>`, `expose` | Exemplo de [08 §5](08-bootstrap-e-componentes.md) funciona |
| **M6 — DX** | Diagnósticos, sourcemaps, HMR, template `create`, devtools-lite | Dev novo cria app em < 5 min |
| **M7 — Async** | `await` no componente, `pending`/`refresh`, `<Async>` — ver [11](11-async-no-componente.md) | Tela com fetch sem `watch` manual |
| **M8 — Validação** | Benchmarks + teste com devs | Critérios abaixo avaliados |

## Critérios de sucesso

**Técnicos**
- TodoMVC escrito **sem nenhum** `useX`, `signal()` ou `()` de leitura no código do usuário.
- Teste automatizado prova: alterar um item da lista executa **só** os bindings daquele item.
- Runtime < 5 KB gzip.
- [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark): dentro de ~10% do Solid e claramente melhor que React.

**De experiência (validação da ideia)**
- 3 a 5 devs React fazem a mesma tarefa (ex.: tela de lista + filtro + formulário) em React e em Jotastic.
- Medir: tempo, número de bugs, e perguntar "o que surpreendeu?".
- Sinal positivo: nenhuma surpresa causada por "o componente só roda uma vez" que o compilador não tenha avisado.
