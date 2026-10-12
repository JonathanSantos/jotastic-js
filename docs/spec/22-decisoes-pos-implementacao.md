# 22 — Decisões pós-implementação

Resolve [21-pendencias.md](21-pendencias.md). Cada decisão diz **o que muda** (contrato, spec, código, teste). Onde não há coluna "muda", o provisório vira definitivo. Os contratos em [contracts/](contracts/) e os documentos citados já estão atualizados; o código precisa acompanhar.

## As sete que mudam contrato

### L-1 — Item de lista é lazy (D58)

**Decisão:** o item segue a regra de "toda entrada é lazy" (props, parâmetros de `use*`): o `render` recebe `item: () => T`. Cada linha guarda um `Signal<T>`; na reconciliação, chave igual com referência diferente faz `itemSignal.set(novo)` (`Object.is` → no-op). Nós preservados **e** dados vivos. Sem reconcile, sem recriar.

| Muda | Como |
|---|---|
| `runtime.d.ts` | `list(parent, marker, source, render: (item: () => T, index: () => number) => Rendered, key?)` |
| 18 §4 | `item` → `item()` em todas as leituras; `item.x = v` → `item().x = v`; desestruturação `({ name }) =>` → `item().name` |
| compiled/02, 06 | `todo.done` → `todo().done` etc. |
| Testes | F8 passa a afirmar: nós preservados **e** texto atualizado para os dados novos |

### U-1 — Aridade de `use*` (D59)

**Decisão:** o **callee** se protege. O compilador emite defaults em thunk para todo parâmetro: sem default → `= _void` (`const _void = () => undefined` do runtime); com default `init = {}` → `init = () => ({})`. Chamadores compilados continuam passando thunks; chamadores não compilados continuam não suportados. Spread em chamada (`useX(...xs)`) → erro `use-spread-args-unsupported`. Escrita em parâmetro → erro `use-param-assignment`.

| Muda | Como |
|---|---|
| `runtime.d.ts` | `export const _void: () => undefined` |
| 18 §11 | regra de defaults |
| 12 | dois IDs novos |
| compiled/03 | `function useFetch(url = _void, init = _void)`; a chamada no comentário não preenche mais `() => undefined` |

### A-1 — `signal` × `state`: a regra vence (D60)

**Decisão:** 18 §3 é a verdade: `signal` só quando o inicializador **e todas** as atribuições são `isProbablyPrimitive`. Caso contrário `state`. Semanticamente idêntico para primitivos; o custo de `state` (proxy no bundle) só aparece em módulos que já usam objetos. `isProbablyPrimitive` ganha: identificador de outro `let` classificado `signal`; `a ?? b` com `b` primitivo; chamada a método de string/number conhecido.

| Muda | Como |
|---|---|
| compiled/02, 03, 04 | `filter`, `error`, `tab`, `matches` → `state(...)` |
| Testes de snapshot | normalizam `signal`/`state` como equivalentes? **Não.** Snapshots atualizados; a regra é testada em `classify.test.ts` |

### S-1 — Store não faz flush síncrono (D61)

**Decisão:** uma regra só na lib: o DOM atualiza no microtask. Ações **não** chamam `flush()`. O teste S4 estava mal escrito: o que importa é que `set` depois de `await` funciona sem contexto de ação e que efeitos veem o valor no próximo microtask; dois `set` no mesmo microtask coalescendo em um flush é o comportamento desejado.

| Muda | Como |
|---|---|
| `store.ts` | remover `flush()` de `inAction` |
| 19 S4 | "`set` após `await` funciona; efeitos rodam no próximo microtask com o valor final; 2 `set` no mesmo microtask = 1 flush" |
| 08 | frase "cada `set` após `await` é seu próprio batch" → "cada `set` após `await` entra no batch do microtask corrente" |

### T-4 — `createStore(state, members)` (D62)

**Decisão:** dois argumentos. O estado é inferido do primeiro; getters e ações vêm do segundo, tipados com `S`. Sem interface explícita, sem currying. `$snapshot()` devolve só o estado (S-4 resolvido), `$reset()` volta ao primeiro argumento (reavaliado se for função).

```ts
export const cart = createStore(
  { items: [] as CartItem[], coupon: null as string | null },
  (set, get) => ({
    get total() { return get().items.reduce((s, i) => s + i.price * i.qty, 0) },
    add: (p: Product) => set(s => { s.items.push({ ...p, qty: 1 }) }),
  }),
)
```

| Muda | Como |
|---|---|
| `jotastic.d.ts` | nova assinatura; `Store<S, M> = DeepReadonly<S> & M & { $snapshot(): S; $reset(): void; $name }` |
| 08, examples/05, 08 | reescritos nessa forma |
| `store.ts`, S1–S6 | adaptar |

### G-2 — `selector` no runtime (D63)

**Decisão:** entra. `selector(source)` devolve um predicado `(v) => boolean` que assina por valor (um `Map<valor, Set<observador>>`): mudar a seleção notifica só a linha antiga e a nova. O compilador o emite quando, dentro do `render` de uma lista, encontra `A === B` (ou `!==`, `Object.is`) em contexto vivo onde um lado lê só signals/memos **de fora** da linha e o outro lê o item.

| Muda | Como |
|---|---|
| `runtime.d.ts` | `selector<T>(source: () => T, equals?: (a: T, b: T) => boolean): (value: T) => boolean` |
| 18 §8 | regra de detecção e emissão: `const _sel0 = selector(() => selected.get()?.id)` antes do `list`; dentro da linha `_sel0(item().id)` |
| Benchmark | select deve cair para ≤ 1,2× |

### V-2 / K-11 — `text` volta; `list` sem pai fixo (D64)

**Decisão (a):** `text(node: Text, read)` volta ao runtime como fast path escalar. O compilador o emite quando a expressão é `isProbablyPrimitive` ou uma leitura simples de signal/memo/prop cujo inicializador é primitivo; o `<!>` nesses casos vira um nó de texto vazio no template (`template` já parseia `<!---->`? Não: emitir um espaço zero-width? **Não.** Emitir `<!>` e o `text` substitui o comentário por um `Text` na primeira execução). Meta do counter: 3 KB; limite duro 3,5 KB até o M8.

**Decisão (b):** `list(parent: Node | null, marker, …)`: com `parent === null`, lê `marker.parentNode` a cada reconciliação. O compilador emite uma âncora `<!>` (via `insert` do pai) para listas em children de componente, fragmentos e condicionais. `const rows = …map(JSX)` fora de posição de filho continua `list-const-used-twice`/`not-implemented`.

| Muda | Como |
|---|---|
| `runtime.d.ts` | `text(node, read)`; `list(parent: Node \| null, …)` |
| 18 §5.1, §8 | critérios de emissão |

### H-2 — HMR formalizado (D65)

**Decisão:** subpath interno `jotastic/runtime/hmr` (dev only, não documentado para o dev) com as assinaturas existentes. Entra no contrato como está.

## Decisões menores que mudam algo

| # | Decisão | Muda |
|---|---|---|
| T-1, L-7 | `JSX.Element` e `Rendered` aceitam arrays recursivos | `jsx.d.ts`, `runtime.d.ts` |
| T-2 | Tabela de nomes compostos (`onDblClick`, `onKeyDown`, `onMouseEnter`…) nos tipos; o compilador já minusculiza | `jsx.d.ts` |
| T-3 | `globalThis.Element` | `jsx.d.ts` |
| T-5 | `useSlots<{ header: JSX.Element; row: (i: Item) => JSX.Element }>(children)`: mapa de tipos, não união de nomes | `jotastic.d.ts`, 02, examples/13 |
| Exemplos com erro de tipo | `title`/`alt`/`aria-*` aceitam `number`; `Boundary.error` recebe `Error` (o runtime embrulha não-Error); `api` dos exemplos vai para `examples/lib/api.ts` em vez de `declare const` | `jsx.d.ts`, `jotastic.d.ts`, examples |
| N-4, N-5, M-4 | **Efeito é escopo**: `onCleanup`, efeitos e memos criados dentro de um efeito pertencem àquela execução e são descartados antes da reexecução (modelo do Solid) | `runtime.d.ts` (effect), 04 |
| X-5 | `external` cujo valor é função: chamada como destroy (padrão `subscribe` → `unsubscribe`) | `runtime.d.ts` |
| C-2 | `derived-recreates-instance` só avisa se a instância tem um método de ciclo de vida (`destroy`/`dispose`/`disconnect`/`close`/`unsubscribe`/`abort`); objetos de plataforma sem isso (MediaQueryList) não avisam | 12, `reactive.ts` |
| A-10 | `state-read-in-setup` só dispara para leitura solta (`count;`) e `console.*(…)`; chamadas de método (`tabs.register(id)`) não avisam | 12, analyzer |
| X-12 | `prefer-key-in-list` só quando a fonte é reatribuível **e** o item é primitivo ou literal de objeto sem `id`; fonte de `await`/store com shape desconhecido não avisa | 12, analyzer |
| I-1, W-7, L-3, X-3, U-1 | IDs novos no catálogo: `not-compiled`, `mount-target-missing`, `pending-not-resource`, `list-duplicate-key`, `context-missing`, `use-spread-args-unsupported`, `use-param-assignment`, `await-position-unsupported`, `await-in-use-unsupported` | 12 |
| I-3 | `<Ctx.Provider value={x}>`: `value` vira getter; `provide` guarda um memo; `useContext` lê o memo → reativo via o `const` que o recebe | `runtime.d.ts` (provide recebe `() => T`), 18 §6 |
| K-5 | Prop de componente com identificador `let` comum (ref) vira getter | 18 §6 |
| K-1, K-2 | Snapshots alinhados a 18 (`data-jo` em dev, `mount(thunk)`); §4 corrigido: `onMount`/`onCleanup`/`untrack`/`tick`/`raw` continuam importados de `jotastic` | compiled/01, 18 §4 |
| M-1, K-3 | `prop(select, 'value')` emitido depois dos bindings dos filhos | 18 §5.3 |
| Q-1 | `__setTestMode(on: boolean)` exportado de `jotastic/runtime` (relança erros não tratados) | `runtime.d.ts` |
| Q-2 | `counts()` = `{ effects, memos, writes }` | 13 |
| C-1 | Tabela de contagens de 19 reescrita com os números reais do compilado de referência; a asserção que importa é "zero efeitos em outros itens" | 19 |
| W-5 | `const x = <expr com um await>` suportado por hoisting (`(await f()).length` → `_r0.value.get().length`); outros casos → `await-position-unsupported`. `await` em `use*` → `await-in-use-unsupported` (MVP) | 18 §10, 12 |
| U-3 | `{x ? <Slot name="h"/> : <i/>}`: `h` e `default` viram getters condicionais complementares | 18 §12 |
| G-6 | Limiar do benchmark: falha se > Solid + 10% **e** > Solid + 2 ms, em 2 de 3 execuções | 19 |
| X-7, X-11 | Limites provisórios: TodoMVC 7 KB, async 9 KB (informativo), até o M8. Com `text` e `selector` reavaliar | 19 |
| examples/06 | `let onlyPublished` sobe para antes do `await` (evita o reset intencional virar aviso no exemplo oficial) | examples/06 |
| examples/07 | `useMediaQuery` sincroniza `matches` com `watch(() => (matches = mql.matches))` além do `on` | examples/07 |
| V-4 | `autoImport` sai do MVP (fica em 13 como fase 2) | 13 |
| W-4 | Painel de Atualizações, Alt+clique e `inspect` no painel ficam para o próximo ciclo; `inspect` em runtime (console) já existe | 14 |

## Aceitos como estão (provisório vira definitivo)

T-6 · N-1 · N-2 · N-3 · N-6 · N-7 · X-1 · X-2 · X-3 · X-4 · X-6 · M-2 · M-3 · M-5 · M-6 · M-7 · M-8 · M-9 · P-1 · P-2 · P-3 · P-4 · P-5 (remover a frase de 11) · P-6 · Q-3 · Q-4 · Q-5 · S-2 · S-3 · S-5 · A-2 · A-3 · A-4 · A-5 · A-6 · A-7 · A-8 · A-9 · A-11 (corrigir os exemplos) · L-2 · L-4 · L-5 (LIS já feito) · L-6 · Y-1 · Y-2 · Y-3 (documentar em 07) · Y-4 · Y-5 · C-3 · C-4 · C-5 · I-2 (todos em ordem) · I-4 · I-5 (migrar quando estável) · B-1 · E-1 · E-2 · E-3 · E-4 · E-5 · K-4 · K-6 · K-7 · K-8 · K-9 · K-10 · K-12 · K-13 · K-14 · K-15 · V-1 · V-3 · U-2 · U-6 · W-1 · W-2 · W-3 · W-6 · W-8 · X-8 · X-9 · X-10 · H-3 · H-4 · H-5 · H-6 · G-1 · G-3 · G-4 (otimizar depois) · G-5 (D29 confirmada: sem delegação) · G-7.

## Ordem sugerida para aplicar

1. D61 (store sem flush) e D62 (`createStore` em dois argumentos): pequenos, destravam exemplos e tipos.
2. D58 (item lazy) e D63 (`selector`): juntos, porque os dois mexem no `render` da lista e no benchmark de select.
3. D64 (`text` + `list` sem pai): tamanho e listas em children.
4. D59 (aridade), D60 (snapshots), N-4/N-5 (efeito como escopo).
5. Tipos (T-1, T-2, T-3, T-5) e exemplos.
6. Diagnósticos novos e ajustes de regra (A-10, X-12, C-2).
7. Benchmark e limites (G-6, X-7).
