# 14 — Pesquisa: como os frameworks lidam com os nossos cenários

> Pesquisa feita em 2026-10-11, com as versões atuais verificadas na web. Os itens marcados *(não verificado)* não puderam ser confirmados em fonte primária.

## Versões consideradas

| Framework | Versão | Destaques recentes |
|---|---|---|
| **React** | 19.2 + React Compiler 1.0 (out/2025) | `<Activity>`, `useEffectEvent`, `ref` como prop. Em fev/2026 passou para a React Foundation |
| **Vue** | 3.5 estável; 3.6 com **Vapor** (sem VDOM) em RC/recém-estável *(data do estável não verificada)* | Destructuring reativo de props (3.5), reatividade reescrita sobre alien-signals (3.6) |
| **Angular** | 22 (jun/2026) | Zoneless e OnPush como padrão; `resource`/`httpResource` e Signal Forms estáveis; `@boundary` em preview |
| **Svelte** | 5.5x | Runes; `await` em componentes atrás de `experimental.async` |
| **Solid** | 1.9 estável; **2.0 em RC** | Async de primeira classe, `<Loading>`/`<Errored>`, setters com draft, batching em microtask |
| **Qwik** | v2 beta *(não verificado)* | `useComputed$` async com `abortSignal` |

---

## 1. Reatividade e estado local

| Cenário | React | Vue | Angular | Svelte 5 | Solid |
|---|---|---|---|---|---|
| Estado | `useState` | `ref`/`reactive` | `signal()` | `let x = $state(0)` | `createSignal` |
| Derivado | `useMemo` (auto via Compiler) | `computed` | `computed` | `$derived` | `createMemo` |
| Efeito | `useEffect` + deps | `watch`/`watchEffect` | `effect()` | `$effect` | `createEffect` (2.0: compute + apply) |
| Componente roda... | a cada render | `setup` 1x | classe 1x | script 1x | 1x |
| Destructuring de props | ok (valores) | ok, compilado (3.5) | `input()` signals | ok, compilado | **quebra** a reatividade |
| Objetos | imutável | proxy profundo | imutável, `equal` custom | proxy **só POJO/array** | store + `reconcile` |
| DOM atualiza | batch; `flushSync` | fila; `nextTick` | agendado | microtask; `tick` | 1.x síncrono; 2.0 microtask + `flush` |

**Achados principais**
- O `let x = $state(0)` do Svelte 5 é o mais elogiado por parecer JS puro. Nosso `let` sem rune vai um passo além, e a lição do Svelte 4 vale: deixar **explícito que só o `let` no escopo do componente** é reativo.
- **Destructuring de props** compilado para `props.x` já é o padrão no Vue 3.5 e no Svelte 5. No Solid é a reclamação nº 1. Armadilha herdada: passar a prop para uma **função externa** no setup (`useX(foo)`) entrega só o valor.
- **Classes dentro de proxy quebram campos `#privados`** ("Cannot read private member..."; o Vue resolve com `markRaw`). O Svelte proxya **só POJO/array**.
- **Derivado gravável** (`linkedSignal` no Angular, `$derived` sobrescrevível no Svelte, `createSignal(fn)` no Solid 2.0) é uma demanda recorrente: "estado local que reseta quando a prop muda".
- O **Solid 2.0** passou a fazer as leituras refletirem as escritas **só depois do flush**, e foi criticado por fugir de "signals como variáveis". Para nós, `count++; console.log(count)` precisa imprimir o valor novo.
- O Solid 2.0 e o Svelte avisam quando um valor reativo é **lido no corpo do componente** esperando reatividade (`state_referenced_locally`).

## 2. Renderização e ciclo de vida no DOM

| Cenário | React | Vue | Angular | Svelte 5 | Solid |
|---|---|---|---|---|---|
| Atualização | VDOM + Compiler | VDOM com patch flags; Vapor direto | signals + OnPush | fino, compilado | fino |
| Preservar oculto | `<Activity>` | `<KeepAlive>`, `v-show` | CSS/`[hidden]` | CSS/`hidden` | CSS/`hidden` |
| Animação de saída | libs | `<Transition>` | `animate.leave` | `transition:` | libs |
| Early return | natural | só render fn | n/a | n/a | desaconselhado |
| Listas | `key` opcional | `:key` + LIS | `track` **obrigatório** | `(key)` | `<For>`/`<Index>` |
| Two-way | controlado | `v-model`, `defineModel` | `model()` | `bind:`, `$bindable` (opt-in) | manual |
| Eventos | delegação no root | diretos | diretos | delegação | delegação no `document` |
| Error boundary | classe | `onErrorCaptured` | `@boundary` (preview) | `<svelte:boundary>` | `<ErrorBoundary>` |

**Achados principais**
- **Nenhuma lib mainstream transforma early return em condicional reativa** *(não verificado que nenhuma exista)*. É um diferencial real.
- O React `<Activity>` **destrói os efeitos** quando oculta e os recria ao mostrar. Vídeo, áudio e iframe continuam tocando. O Vue oferece `onActivated`/`onDeactivated`.
- O atributo `hidden` perde para um `display` definido no CSS do autor.
- **Delegação de eventos** causa bugs reais: no Solid, `stopPropagation` não impede o handler delegado do ancestral; no Svelte, a issue #15343 (um `stopPropagation` num listener nativo do pai quebra todos os `onclick` dos filhos) foi fechada como *not planned*.
- O Svelte 5 passou a exigir **opt-in no filho** para two-way em componentes (`$bindable`), porque o two-way livre do Svelte 4 dificultava rastrear o fluxo.
- Os error boundaries de React, Svelte e Angular **não capturam erros de handlers e de código async**.

## 3. Dados assíncronos

| Cenário | React | Vue | Angular | Svelte 5 async | Solid 2.0 |
|---|---|---|---|---|---|
| Refaz quando o param muda | TanStack (`queryKey`) | `await` no setup **não** refaz | `params: () => ...` | `$derived(await f(id))` | memo async |
| Fallback | `<Suspense>` + ErrorBoundary | `<Suspense>` (experimental) | `isLoading()` no template | boundary com `pending` obrigatória | `<Loading>`/`<Errored>` |
| Cancelamento | manual / TanStack `signal` | libs | **automático** | coordenação global | via grafo |
| Recarga mantém conteúdo | `keepPreviousData`/transition | libs | **não** (`value` vira `undefined`) | sim | **sim** (fallback só na 1ª vez) |
| Paralelismo de awaits | não | não | resources independentes | **só no markup**; script sequencial + aviso `await_waterfall` | memos paralelos + aviso `ASYNC_WATERFALL` |
| `try/catch` local | **não** com `use()` | sim | n/a | vai para a boundary | vai para a boundary |

**Achados principais**
- **O Svelte async é o modelo mais próximo do nosso `await` no componente**, ainda experimental. As dores relatadas são o bloqueio implícito ("o estado não aparece até o async terminar") e a depuração de cadeias de dependência.
- **A tendência é manter o conteúdo antigo ao recarregar** (Solid 2.0, Svelte). O Angular é a exceção, e a própria documentação ensina boilerplate para contornar.
- **Nossa D11 (sequencial + `Promise.all`) é a mesma escolha do Svelte no `<script>`**. Svelte e Solid adicionaram um **aviso de waterfall** no compilador/dev.
- Todos convergem em **"valor derivado assíncrono" no lugar de "efeito imperativo"**, que é exatamente a nossa proposta.
- Cache **fora do núcleo** é o consenso (TanStack/Pinia Colada como referência).

## 4. Estado compartilhado

| Lib | Provider | Seletor | Mutação | Readonly fora das ações |
|---|---|---|---|---|
| Zustand 5 | não | **sim** (`useShallow`) | imutável | não |
| Redux Toolkit | sim | sim | Immer | por convenção |
| MobX | não | não | mutável | `enforceActions` |
| Valtio | não | não | proxy | o snapshot é readonly |
| Pinia | plugin | não | proxy | não |
| Svelte 5 | não (`.svelte.ts`) | não | proxy | não |
| Solid 2.0 | não | não | **setter com draft** | **sim** |

**Achados principais**
- Seletores existem por causa do `useSyncExternalStore` do React. No v5 do Zustand, um seletor que retorna objeto novo gera **"Maximum update depth exceeded"**. As libs com proxy dispensam seletores. ✔ Nossa decisão.
- O **Solid 2.0** chegou praticamente ao nosso desenho: store readonly + setter que recebe um draft mutável.
- **Desestruturar store quebra a reatividade** no Pinia (`storeToRefs`). Nosso compilador converte em derivado dentro de componentes.
- O **MobX exige `runInAction` depois do `await`** em ações async, uma dor conhecida. Nossas ações async precisam manter o contexto de ação.
- `persist` precisa de `version`/`migrate` e de uma allowlist de chaves desde o início.

## 5. DX e tooling

| Framework | Devtools | HMR preserva estado | Tamanho (js-framework-benchmark, brotli) |
|---|---|---|---|
| React | extensão + Profiler | sim (Fast Refresh, pela ordem dos hooks) | ~50 KB |
| Vue | extensão; v9 beta vira dock do Vite | só ao editar o template | ~23 KB (Vapor ~19 KB) |
| Angular | signal graph | *(não verificado)* | ~35–46 KB |
| Svelte 5 | extensão sem suporte declarado ao 5 | **não** (desabilitado de propósito) | ~10 KB |
| Solid | comunitário | parcial (`@refresh granular`) | ~4,5 KB |
| Preact + Signals | extensão | sim | ~6–8 KB |
| Referência | — | — | alien-signals 2,9 · VanJS 2,0 |

**Achados principais**
- O **painel embutido do TanStack** é elogiado (sem extensão, qualquer browser). O React DevTools é criticado por "ruído", e foi isso que gerou o `react-scan`. Responder "**por que este nó atualizou?**" é um diferencial.
- ⚠️ **O Svelte abandonou o HMR que preservava estado local por nome** (`@hmr:keep`) por ser "imprevisível e propenso a erros". Isso impacta nossa proposta R10.
- TSX puro funciona com `tsc`, ESLint e qualquer editor; `.vue`/`.svelte` exigem language server próprio. ✔ Nossa vantagem.
- O `state_referenced_locally` (Svelte) e os extended diagnostics (Angular) são bons modelos de diagnóstico.

---

## Impacto no que já definimos

### ✅ Confirmado pela pesquisa

| Nossa decisão | Evidência |
|---|---|
| `let` → signal, componente roda 1x | Svelte 5 / Solid validam o modelo |
| Props como getters, destructuring seguro | Vue 3.5 e Svelte 5 fazem igual; no Solid é a dor nº 1 |
| Early return reativo (D5) | Ninguém faz: é diferencial |
| `.map` compilado para lista com chave | Solid exige `<For>`; Angular exige `track` |
| `hidden` em vez de `keep:alive` (D14) | Svelte/Solid/Angular também não têm KeepAlive nativo |
| `await` sequencial + `Promise.all` (D11) | Mesma escolha do Svelte no script |
| Manter conteúdo antigo ao recarregar | Tendência no Solid 2.0 e no Svelte |
| Store sem seletores | Valtio, Pinia, MobX, Solid |
| R7: store readonly + `set` com draft | Solid 2.0 chegou ao mesmo desenho |
| R8: sem proxy em classes | Regra do Svelte; bug do `#private` no Vue |
| R11: `tick()` | Todos têm (`nextTick`, `tick`, `flushSync`) |
| Devtools embutido | TanStack elogiado; React criticado |
| TSX puro | Tooling grátis |

### ⚠️ Precisa de revisão

| Ponto | O que a pesquisa mostrou | Ajuste sugerido |
|---|---|---|
| **R10 — HMR preservando `let` por nome** | O Svelte tentou e abandonou | Preservar só se o **inicializador não mudou** (hash), avisar no console o que foi preservado/resetado, `// @refresh reset`. Stores de módulo sempre preservam. Ou rebaixar para pós-MVP |
| **R9 — "< 3 KB hello world"** | Solid tem ~4,5 KB no app do benchmark; só alien-signals/VanJS ficam abaixo de 3 KB | Meta pela métrica do js-framework-benchmark: **≤ Solid (~5 KB)** |
| **`try/catch` em `await` de componente** (marcamos "não suportado") | É uma vantagem clara sobre o `use()` do React, que não permite | Reconsiderar: permitir e propagar ao `<Async>` só o que não for capturado |
| **R13 — Delegação de eventos** | Bugs reais no Solid e no Svelte (#15343) | Delegar na **raiz da app** (não no `document`), emular `currentTarget`/`stopPropagation`, oferecer listener nativo explícito |

### 🆕 Ideias novas trazidas pela pesquisa

1. **Aviso de waterfall** no compilador para `await` independentes (como `await_waterfall`/`ASYNC_WATERFALL`). Encaixa na D11 adiada.
2. **Diagnóstico de leitura reativa no corpo** (estilo `state_referenced_locally`): `console.log(count)` no topo roda uma vez só.
3. **Derivado gravável**: estado local que reseta quando a prop muda.
4. **Opt-in no filho para `bind:` em componentes** (como `$bindable`/`model()`).
5. **Error boundary que captura erros de handlers e efeitos**: possível porque cada componente tem owner. React e Svelte não fazem isso.
6. **Hooks `onHide`/`onShow`** para conteúdo oculto com `hidden` (pausar vídeo, timers).
7. **Erro em dev para efeito que escreve num signal que ele mesmo lê** (loop).
8. **Leitura síncrona garantida**: o signal reflete a escrita na hora; só o DOM espera o microtask.

---

## Fontes

**React:** react.dev/blog/2025/10/01/react-19-2 · react.dev/blog/2025/10/07/react-compiler-1 · react.dev/reference/react/Activity · react.dev/reference/react/use · react.dev/learn/you-might-not-need-an-effect · react.dev/reference/eslint-plugin-react-hooks · blog.logrocket.com/react-compiler-memoization-what-actually-broke · hackernoon.com/react-activity-when-a-render-no-longer-guarantees-an-effect · github.com/testing-library/dom-testing-library/issues/1370 · github.com/aidenybai/react-scan · nextjs.org/docs/architecture/fast-refresh

**Vue:** vuejs.org/guide/components/props.html · vuejs.org/guide/built-ins/suspense.html · github.com/vuejs/core/issues/2981 · github.com/visjs/vis-network/issues/2092 · newreleases.io/project/github/vuejs/core/release/v3.6.0-rc.1 · blog.openreplay.com/vue-vapor-mode · pinia.vuejs.org/core-concepts · pinia-colada.esm.dev · devtools-next.vuejs.org/guide/vite-plugin

**Angular:** angular.dev/guide/signals · angular.dev/guide/signals/resource · angular.dev/guide/http/http-resource · angular.dev/guide/templates/error-boundaries · angular.dev/guide/animations/migration · angular.dev/extended-diagnostics · infoq.com/news/2026/08/angular-v22-released · angularindepth.com/article/getting-to-know-angular-resource-snapshots

**Svelte:** svelte.dev/docs/svelte/$state · svelte.dev/docs/svelte/await-expressions · svelte.dev/docs/svelte/svelte-boundary · github.com/sveltejs/svelte/discussions/15845 · github.com/sveltejs/svelte/issues/15343 · github.com/sveltejs/svelte/issues/17356 · github.com/sveltejs/vite-plugin-svelte/blob/main/docs/faq.md · github.com/sveltejs/svelte-devtools

**Solid:** infoq.com/news/2026/05/solidjs-2-async · github.com/solidjs/solid/releases · docs.solidjs.com/v2/reference/reactivity/is-pending · docs.solidjs.com/v2/reference/stores/create-store · docs.solidjs.com/concepts/components/event-handlers · github.com/solidjs/solid-refresh

**Estado / tooling:** zustand.docs.pmnd.rs/migrations/migrating-to-v5 · valtio.dev/docs/introduction/getting-started · mobx.js.org/configuration.html · jotai.org/docs/extensions/scope · tanstack.com/query/latest/docs/framework/react/devtools · tanstack.com/query/latest/docs/framework/react/guides/query-cancellation · krausest.github.io/js-framework-benchmark/current.html · devblogs.microsoft.com/typescript/announcing-typescript-5-1 · next.qwik.dev/docs/upgrade
