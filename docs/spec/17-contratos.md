# 17 — Contratos de implementação

Este documento é o índice dos contratos exatos. Os arquivos em [contracts/](contracts/) são a fonte da verdade para assinaturas; aqui ficam as decisões de organização e as semânticas transversais que não cabem em um `.d.ts`.

| Arquivo | O que define |
|---|---|
| [contracts/runtime.d.ts](contracts/runtime.d.ts) | `jotastic/runtime`: tudo o que o código compilado chama, com semântica e casos de borda por função |
| [contracts/jotastic.d.ts](contracts/jotastic.d.ts) | API pública (`jotastic`, `jotastic/store`, `jotastic/fetch`), como o dev vê |
| [contracts/jsx.d.ts](contracts/jsx.d.ts) | Namespace `JSX`: elementos, atributos, eventos, `key`, `ref`, `class` |
| [contracts/analyzer.d.ts](contracts/analyzer.d.ts) | Saída do `@jotastic/analyzer`: corpos reativos, classificação, fluxo, diagnósticos |
| [contracts/devtools.d.ts](contracts/devtools.d.ts) | Eventos emitidos em dev |
| [compiled/](compiled/README.md) | Saídas compiladas à mão: primeiros snapshots do compilador e primeiros testes do runtime |
| [18-transformacoes.md](18-transformacoes.md) | Algoritmo do compilador, passo a passo |
| [19-plano-de-testes.md](19-plano-de-testes.md) | Testes de contrato com asserções exatas |
| [20-guia-de-implementacao.md](20-guia-de-implementacao.md) | Ordem de implementação, ferramentas, definição de pronto |

## Pacotes e módulos

```
packages/jotastic/src/
├─ runtime/
│  ├─ reactive.ts      signal, state, memo, effect, untrack, batch, flush, tick, scheduler, loop guard, abortSignal ambiente
│  ├─ owner.ts         createOwner, getOwner, runWithOwner, onCleanup, dispose, handleError
│  ├─ proxy.ts         reactive, raw, isReactive, toReactive, readonly, shallowEqual
│  ├─ dom.ts           template, insert, attr, prop, bool, classList, style, spread, listen, twoWay, autofocus
│  ├─ flow.ts          component, keyed, branches, list, children, slots, SLOTS, portal
│  ├─ async.ts         resource, continuation, boundary
│  ├─ external.ts      external, on, onMount, inspect
│  ├─ props.ts         rest, mergeProps, createContext, provide, useContext
│  ├─ root.ts          createRoot
│  └─ devtools.ts      emitDevtools (no-op se o hook não existe)
├─ index.ts            API pública: mount, watch, on, external, …, Boundary, Portal, Slot, useSlots (ver jotastic.d.ts)
├─ store.ts            createStore
├─ fetch.ts            fetch com abortSignal ambiente
└─ jsx-runtime.d.ts    tipos JSX
```

Exports do `package.json`: `.`, `./runtime`, `./store`, `./fetch`, `./jsx-runtime`. Cada helper do runtime deve ser tree-shakeable: sem efeitos colaterais no topo dos módulos (`sideEffects: false`).

## Semânticas transversais

### Scheduler

- Duas filas ordenadas por `id` de criação: **render** (bindings de DOM, decisões de branch, `list`, `resource.fn`) e **user** (`watch`, `onMount`, `on`, `external`, `inspect`).
- `signal.set` → marca dependentes (`DIRTY` diretos, `CHECK` transitivos) e agenda `flush()` em `queueMicrotask` (uma vez por tick).
- `flush()`: enquanto houver itens, processa a fila de render inteira em ordem de id, depois a fila user em ordem de id. Itens criados durante o flush entram nas filas e são processados no mesmo flush.
- Efeito cujo owner está `disposed` é pulado. Um efeito re-agendado 100 vezes no mesmo flush lança `effect-loop`.
- **Primeira execução**: `memo` e efeitos de render rodam na criação (síncronos); efeitos user rodam no primeiro flush depois da criação. `createRoot` chama `flush()` síncrono depois de inserir os nós, então `onMount` e `watch` veem o DOM pronto.
- **Leitura síncrona**: `signal.get()` devolve o valor novo imediatamente; `memo.get()` com fonte marcada recalcula na hora (pull).

### Por que a ordem de criação garante "de cima para baixo"

O setup roda de cima para baixo; um branch cria sua decisão (efeito de render, id N) antes de qualquer binding da continuação (ids > N). No flush, a decisão roda primeiro; se ela descarta a continuação, os bindings dela são pulados. Esse invariante é testado em [19 §Fluxo](19-plano-de-testes.md).

### Rastreamento

- Um contexto global `currentObserver` e `currentOwner`. `get()` de signal/memo adiciona a fonte ao observador atual.
- Memo e efeito limpam as fontes antigas antes de reexecutar (recoleta).
- `untrack` zera `currentObserver` durante `fn`.
- Getters de props (`get label() { return title.get() }`) são rastreados naturalmente no ponto de leitura.

### Memo

- Criação: executa `fn` **agora**. Se não assinou nada → `constant = true` (devolve o valor cacheado para sempre, libera a função).
- Pull: `get()` com estado `CHECK` consulta as fontes (chamando `get()` delas, que podem recalcular); se nenhuma mudou de valor, volta a `CLEAN` sem recalcular.
- Igualdade: `Object.is`, ou `shallowEqual` quando ambos são arrays ou ambos são POJO. `equals: false` desliga.
- Em dev, o valor devolvido por `get()` passa por `readonly(v, 'derived-mutated')` se for POJO/array.

### Objetos reativos

- `reactive(target)` cacheia em `WeakMap<target, proxy>` e `WeakMap<proxy, target>`.
- Signals por propriedade em `Map<PropertyKey, Signal>` guardado por target, criados sob demanda (`get` só cria se há observador).
- Arrays: signal `$iter` (estrutura) e `length`. `get(index)` assina o índice; `ownKeys`/iteração assinam `$iter`. Mutadores (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`) rodam em `batch` e notificam `$iter`, `length` e os índices afetados.
- `set`: `Object.is(prev, next)` → nada; senão grava o **raw** de `next` e notifica. Se a propriedade não existia, notifica `$iter`.
- Nunca proxia: valores com `raw()`, instâncias de classe (protótipo diferente de `Object.prototype`/`null`), `Map`, `Set`, `Date`, `RegExp`, `Promise`, nós do DOM, `File`, typed arrays.

### Erros

`handleError(owner, e, phase)` sobe pelos owners até um `boundary` com `error`; se nenhum trata, chama o `onError` do root; sem `onError`, `console.error` com a `loc`. Nunca relança (bindings vizinhos continuam vivos). Em `@jotastic/test`, o root sem `onError` **relança** para o teste falhar.

### Two-way

| Elemento / `type` | `kind` do `twoWay` | Evento | Coerção |
|---|---|---|---|
| `input` texto, `textarea`, `type` dinâmico | `value` | `input` | string |
| `input type="number" \| "range"` | `number` | `input` | `valueAsNumber`; `NaN` → `null` |
| `input type="checkbox"` (`checked`) | `checked` | `change` | boolean |
| `select` | `select` | `change` | string |
| `select multiple` | `multiple` | `change` | `string[]` |
| `input type="radio"`, `file` | — | — | nunca two-way |

### Convenções de emissão descobertas nas saídas compiladas

- `insert(parent, read, null)` quando o elemento tem **só** aquele conteúdo dinâmico; senão marker `<!>`.
- Props com valor padrão: `props.x ?? default` em cada leitura (o default é avaliado a cada leitura; se for caro, o dev usa `const`).
- Parâmetros de `use*`: **toda** leitura de um parâmetro vira chamada (`url()`, `handler()()`), inclusive funções.
- Retorno de `use*`: por propriedade do literal: `let` → getter + setter; `const` memo/externo → getter; expressão com leituras reativas → memo hoisted + getter; função ou literal sem leituras → como está.
- `autofocus(el)` é emitido para elementos com o atributo `autofocus` dentro de branches, itens de lista e continuações (o atributo nativo só funciona no carregamento da página).
- `component(Comp, props, dev)` para todo componente; `keyed(() => key, () => component(…))` quando há `key`.
- Spread em componente: `mergeProps(a, { x: 1 }, b)`; rest em props: `rest(props, ['a', 'b'])`.
- JSX fora de corpo reativo (argumento de `mount`, constantes de módulo) vira thunk `() => …`.
