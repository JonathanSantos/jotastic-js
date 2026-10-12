# 15 — Registro de decisões

Todas as decisões vigentes, com o porquê em uma linha. Os números preservam os IDs do refinamento; as propostas R1–R13 e D24–D46 foram aprovadas em 2026-10-11.

## Modelo e execução

| ID | Decisão | Por quê |
|---|---|---|
| — | Componente roda uma vez; atualização por nó | Tese central; sem re-render, sem VDOM |
| T1 | Regra de ouro em três frases ([01](01-modelo-mental.md)) | Toda regra deriva dela |
| D1 | `let` reativo só em corpos reativos (componentes e `use*`) | Fora disso, JS é JS |
| **D25** | **Reatribuição é rastreada pelo `let`; mutação, pelo objeto.** `const obj = {}` sem leituras reativas é estado mutável; com leituras é derivado; getters no literal são derivados por propriedade | 1:1 com a semântica do JS; evita a armadilha `const items = []` + `push` sem quebrar `[...users].sort()` |
| **D26** | Derivados executam na hora (ordem do código); recálculo lazy; resultado somente leitura | Preserva "o corpo roda de cima para baixo"; evita `const` que nunca roda |
| T1 | `const` com `new` é derivado (`new Intl.NumberFormat(locale)`); libs com ciclo de vida usam `external` | A exceção "`new` nunca é derivado" (R5) foi descartada |
| T1 | Closures leem o valor atual; leitura síncrona; DOM em microtask; loop guard 100 | Sem stale closures; `count++; log(count)` imprime o novo |
| **D24** | **Reatribuir troca a referência; reconcile é opt-in (fase 2)** | Reconcile implícito corrompe objetos com alias (`selected = todos[1]`, `original = user`) |
| D2/R8 | Proxy profundo e lazy **só em POJO/array**; classes, `Map`, `Set`, `Date`, DOM intactos | Princípio funcional; bug de `#private` |
| D33 | Derivado gravável: sem API; `watch(() => (draft = value))` ou `key` | Copiar é o esperado por quem vem do `useState(props.x)` |
| **D27** | **Funções `use*` são compiladas** com as regras do componente; parâmetros lazy; retorno com getters/setters | Lógica reutilizável sem primitivas expostas e sem regras de hooks |
| T1 | `watch` explícito; instruções reativas automáticas descartadas; aviso com autofix | Intenção ambígua, sem lugar para cleanup |
| T1 | `external(create, update?, destroy?)` e `on()` no núcleo | Cobrem quase todo `useEffect` do React |
| — | `external` só chama `close`/`abort`/`terminate` em tipos conhecidos | Não fechar o painel errado |

## JSX e DOM

| ID | Decisão | Por quê |
|---|---|---|
| D7 | `class`/`for`; `className`/`htmlFor` com aviso e autofix | É HTML; migração indolor |
| D30 | Atributos: nomes camelCase do React **e** minúsculos do HTML, normalizados em build; `style` camelCase ou kebab | Quem vem do React não precisa reaprender |
| **D29** | Eventos: `onX` camelCase → evento nativo; **listeners diretos**; semântica nativa (`onChange` = `change`); `onXCapture`; `on:custom` | Zero surpresa (bugs reais de delegação no Solid/Svelte); delegação local só se o benchmark provar ≥ 10% |
| **D31** | **Sem `bind:`.** `value`/`checked` sem handler e com expressão atribuível são two-way (o compilador gera o handler com coerção pelo `type`); com handler, one-way + handler como no React; `readOnly` desliga | Zero sintaxe nova; o React trata `value` sem handler como bug, então nada legítimo é perdido |
| D32 | Two-way em componentes: `x` + `onXChange`, escrito pelo dev | Mesma convenção, sem açúcar |
| **D47** | **`<Slot name>` + `useSlots`**: slots nomeados e com parâmetro resolvidos em build; sem API genérica de filtrar children | Resolve o `Children.map` do React sem reintroduzir elementos |
| D52 | Chave padrão de lista: `item.id ?? item.key ?? referência` | Cobre a maioria sem o dev pensar; visível no devtools |
| — | `innerHTML` no lugar de `dangerouslySetInnerHTML` | — |
| D34 | `hidden` é só atributo; efeitos continuam; sem `onHide`/`onShow` | Não inventar semântica para HTML |
| D46 | Listas: `key` opcional (referência/índice); `prefer-key-in-list` só quando a fonte é reatribuível; índice vivo; cadeias `.filter().map()` | Avisar só quando importa |
| R6 | `const rows = items.map(i => JSX)` vira lista | Extrair JSX para variável não perde performance |
| — | `children` memoizado por instância; spread preserva getters | Nada criado duas vezes |

## Controle de fluxo e async

| ID | Decisão | Por quê |
|---|---|---|
| D5 | Early return reativo no MVP | Código natural; o compilador transforma |
| D13 | Estado da continuação reseta; aviso `continuation-state-resets` | Simples e previsível |
| D14 | `keep:alive` fase 2; `hidden` cobre o MVP; owner nasce com pause/resume | Sem estado novo no runtime do MVP |
| D11 | `await` sequencial; `Promise.all` explícito; dica `await-waterfall` | Semântica do JS, sem surpresas |
| **D48** | **`<Boundary pending error>`** único, no lugar de `<Async>`, `<Catch>` e das props injetadas `pending`/`error` | Explícito, sem prop mágica; Suspense + ErrorBoundary em uma peça |
| **D49** | `abortSignal()` é ambiente (válido em funções chamadas sincronamente a partir do `await` ou dentro de `watch`); `jotastic/fetch` drop-in; fora de recurso/efeito devolve signal que nunca aborta | O componente nunca escreve `signal`; injeção totalmente automática é impossível sem tipos |
| D22 | Sem garantia de consistência ao recarregar; `pending(x)` para dimmed | Simples primeiro; transições na fase 2 |
| D21 | `try/catch` em `await` na fase 2 | O `resource` nasce com erro roteável |
| D12 | `cached()` fase 2 | O `resource` já aceita |
| D36 | `let x = await …` permite sobrescrita local | Optimistic update de graça |

## Estado compartilhado e erros

| ID | Decisão | Por quê |
|---|---|---|
| D15 | `createStore((set, get) => …)`; sem variante com `this` | Zustand, que o público conhece |
| R7/D37 | Readonly fora das ações; `set` com uma assinatura; ações em batch; sem `runInAction` | Um caminho para mudar; devtools completo |
| D3 | Store em módulo no MVP; `defineStore` com escopo na fase 2 | — |
| D45 | `createContext` fase 2; owner tem slot `context` desde o M1 | Sem refatoração depois |
| D35 | `<Boundary>` captura setup, bindings, `await`, efeitos e **handlers (inclusive async)** | Owner permite; React/Svelte não fazem |
| D38/R3 | `mount(el, alvo, { plugins, onError })`; sem `createApp` | Uma função, um objeto |
| — | `<Portal>` no M5 | Modais pedem; é pequeno |
| D50 | `inspect(x)` em dev; overlay de erro do Vite; Alt+clique abre no editor; auto-import opcional; `llms.txt` | DX do dia a dia com custo baixo |
| D51 | Two-way automático promovido ao MVP (absorvido por D31) | Era o maior ruído nos exemplos |
| D53 | `on(alvo, …)` tem alvo lazy: re-liga quando muda, funciona com `ref` antes de montar | Dispensa `watch` com add/remove de listener |
| D54 | `abortSignal()`/`jotastic/fetch` também dentro de `watch`, abortado no cleanup | `useFetch` sem `AbortController` manual |
| D55 | Funções `use*` nunca pedem thunks; parâmetros já são lazy | Coerência com props |
| D56 | `useForm` é receita oficial nos exemplos; `@jotastic/form` na fase 2 | Formulários sem API no núcleo |
| D57 | `useContext(Ctx)` em vez de `Ctx.use()` | `use*` na lib significa função compilada |

## Pós-implementação ([22](22-decisoes-pos-implementacao.md))

| ID | Decisão | Por quê |
|---|---|---|
| **D58** | Item de lista é lazy (`item()`); chave igual com referência nova atualiza o signal da linha | Nós preservados e dados vivos sem reconcile |
| **D59** | Defaults de parâmetros de `use*` em thunk no callee (`= _void`) | Aridade entre módulos |
| **D60** | `signal` só com inicializador e atribuições provavelmente primitivos; senão `state` | A regra vence os snapshots |
| **D61** | Store sem flush síncrono | Uma regra: DOM no microtask |
| **D62** | `createStore(state, (set, get) => members)` | Inferência de tipos sem interface |
| **D63** | `selector` no runtime, emitido pelo compilador para `A === B` em linhas | select 3,6× → ~1× |
| **D64** | `text` volta como fast path escalar; `list(null, marker)` lê o pai da âncora | Tamanho do counter; listas em children |
| **D65** | HMR formalizado em `jotastic/runtime/hmr` (dev only) | Contrato completo |
| — | Efeito é escopo (cleanups e efeitos aninhados morrem na reexecução) | Modelo do Solid; evita acúmulo |
| — | `Boundary.error` recebe `Error` (não-Error embrulhado) | DX nos exemplos |
| — | D29 confirmada pelo benchmark: sem delegação (ganho < 10%) | Medido |

## Compilador, runtime e tooling

| ID | Decisão | Por quê |
|---|---|---|
| **D28** | `@jotastic/analyzer` puro, compartilhado por compiler e ESLint plugin | Avisos no editor, não só no build |
| — | Análise sintática/de escopo, sem tipos do TS | Rápido, simples, portável |
| — | Babel no MVP; oxc/SWC depois, atrás do analyzer | Maduro; Solid usa |
| D43 | Avaliar `alien-signals` como motor por trás de uma fachada própria | 2,9 KB, usado pelo Vue 3.6 |
| D44 | Runtime primeiro; saídas compiladas à mão viram snapshots | Reduz o risco de integração |
| R9/D40 | Tamanho ≤ Solid (~5 KB brotli); imports por helper; medido no CI | Meta honesta |
| R12/D42 | Overlay de flash + contadores logo após o M3 | Demonstra a tese cedo |
| R10/D41 | HMR: remonta preservando stores; `let` por nome só com inicializador inalterado, atrás de flag | Lição do Svelte |
| R2/D39 | API do MVP com 18 itens, sem sintaxe nova no JSX | Validar a tese, não ser completo |
| R13 | Contrato de eventos testado (`currentTarget`, `stopPropagation`, Shadow DOM) | Zero surpresa |
| — | `@jotastic/test` com contador de execuções | O teste que prova a tese |
| D8 | Interop com React: fora | Ortogonal |
| D9 | Nome Jotastic (verificar npm), licença MIT | — |
