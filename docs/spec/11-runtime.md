# 11 — Runtime

> Assinaturas exatas e casos de borda: [contracts/runtime.d.ts](contracts/runtime.d.ts). Este documento é a visão geral.

O runtime é o que o código compilado chama. Alvo: ≤ Solid no js-framework-benchmark (~5 KB brotli), com imports por helper para o hello world ficar bem abaixo disso.

## Primitivas (`jotastic/runtime`)

```ts
signal<T>(initial: T): { get(): T; set(v: T): void }
memo<T>(fn: () => T): { get(): T }                 // executa na hora; recalcula lazy; corta se igual
effect(fn: () => void | (() => void)): Dispose      // base do watch
batch(fn: () => void): void
untrack<T>(fn: () => T): T
store<T extends object>(obj: T): T                 // proxy profundo e lazy (só POJO/array)
raw<T>(v: T): T                                    // marca / desembrulha
owner(): Owner; runWithOwner(o, fn); onCleanup(fn)
template(html: string, isSVG?: boolean): () => Node
attr(el, name, read); prop(el, name, read); bool(el, name, read); classList(el, read); style(el, read); twoWay(el, kind, write)
insert(parent, read, marker); branches(cases, fallback); list(parent, source, render, key?, marker)
listen(el, type, handler, opts?); resource(fn); continuation(res, fn); boundary(props, fn); spread(el, read)
```

A fachada é própria. O motor de signals pode ser o `alien-signals` (avaliado no M1 por benchmark e pela capacidade de emitir eventos do devtools); se não servir, implementação própria por trás da mesma fachada.

## Scheduler: push-pull com coloração

1. **Push:** `set()` marca dependentes diretos como `DIRTY` e indiretos como `CHECK`. Nada é recalculado.
2. **Agendamento:** effects entram numa fila processada em **microtask**.
3. **Pull:** um effect `CHECK` pergunta às fontes se mudaram; um memo recalcula e, se igual, o effect é descartado sem rodar.
4. **Signal ambiente:** cada execução de `effect` publica um `AbortSignal` abortado no cleanup; `abortSignal()` e `jotastic/fetch` o leem.
5. **Leitura síncrona:** `signal.get()` depois de `set()` devolve o valor novo; um memo lido depois de `set()` recalcula na hora. Só o DOM espera o flush.
6. **Ordem:** owners de cima para baixo; dentro do owner, ordem de criação. Um owner descartado durante o flush tem seus effects pendentes cancelados.
7. **Loop guard:** 100 execuções seguidas do mesmo effect → erro.

| Guard | Evita |
|---|---|
| `set` com `Object.is` igual é no-op | atualização inútil |
| memo igual corta a propagação (`Object.is` ou comparação rasa de array/objeto plain) | cascata |
| Batching em microtask | vários `set` → várias atualizações |
| DIRTY/CHECK | glitches e recalcular o que ninguém lê |
| Dependências recoletadas | assinar branches inativos |
| `if (node.data !== v)` / `if (el.value !== v)` | reflow inútil, caret pulando |

## Objetos reativos (`store`)

- Proxy criado **lazy** no primeiro acesso; cache `WeakMap` raw → proxy (identidade estável).
- Um signal por propriedade (criado sob demanda). Ler `todo.done` assina só `done`.
- **Um sinal estrutural por array** (`length`/ordem): `list()` tem uma assinatura, não uma por índice.
- Métodos de array (`push`, `splice`, `sort`...) rodam em batch e notificam a estrutura + índices afetados.
- `includes`/`indexOf`/`lastIndexOf`: comparam raw e proxy (`Map`/`Set` não são proxiados).
- Só POJO e array são proxiados. Classes, `Map`, `Set`, `Date`, DOM, `File`, `Promise` passam intactos.
- Atribuir um objeto a uma propriedade **troca a referência** (o novo vira proxy lazy). `reconcile(prev, next)` (fase 2) mescla por chave quando o dev quer identidade estável.
- Em dev: proxies readonly para resultados de memo e para stores fora de ações (avisam ao escrever).

## Binding direto no DOM

```ts
// insert, caso texto (o Text é reutilizado entre atualizações)
effect(() => {
  const v = normalize(read())
  if (typeof v === 'string' && current instanceof Text) { if (current.data !== v) current.data = v }
  else replace(current, v)
}, { kind: 'render' })
```

Cada parte dinâmica é um effect mínimo com referência direta ao nó. Atualizar é escrever no nó.

## `insert`, `branches`, `list`

- `insert`: para `{expr}` que pode ser texto, nó, array ou componente. Comentário marcador como âncora; substitui só o intervalo. Arrays/fragmentos usam marcador de início e fim.
- `branches`: avalia as condições em ordem (cada uma um memo booleano); troca de branch = dispose do owner antigo + criação do novo.
- `list`: `Map<key, { nodes, owner, index: signal }>`. Chave padrão: `item.id ?? item.key ?? item` para objetos, índice para primitivos. Novos criados, removidos descartados, existentes **movidos**. Algoritmo: prefixo/sufixo comum + mapa no MVP; LIS depois. Emite `list-recreated` para o devtools quando descarta todos.

## Eventos

- `listen(el, type, fn, opts)`: `addEventListener` direto, handler embrulhado em `runWithOwner` com try/catch (e `.catch` em promise) para rotear ao `<Boundary>`.
- `on(target: () => EventTarget | undefined, type, fn, opts)`: effect que lê o alvo e (re)liga o listener; remove no cleanup.
- `spread(el, read)`: um binding por chave; `value`/`checked` com setter no objeto e sem `onInput`/`onChange` ganham o listener de two-way com a mesma coerção do compilador.
- Sem delegação no MVP. Se o benchmark do M3 mostrar ≥ 10% de ganho em "create 10k rows", `list()` ganha delegação **local ao container**, com `currentTarget` emulado, nunca no `document`.

## Owner tree

Cada componente, branch, item de lista, continuação e `<Boundary>` é um owner com: effects, cleanups, filhos, mapa de contexto, fronteira de erro, metadados de dev. Dispose é recursivo e em ordem reversa. O owner nasce preparado para `pause/resume` (`keep:alive`, fase 2).

## `resource`

Estado: `{ value, error, pending, version }`. Cada execução cria um `AbortSignal`, o publica como **signal ambiente** (`abortSignal()` o lê durante a parte síncrona da chamada), aborta o anterior e incrementa `version`; respostas com versão antiga são ignoradas. `refresh()` reexecuta mantendo `value`. `jotastic/fetch` é um `fetch` que lê o signal ambiente. Compatível com um `cached()` externo.

## Testes de contrato

- Contagem de execuções por binding em cada exemplo oficial.
- Alternar branch N vezes: N instâncias, 0 vazamento de assinantes.
- `true → false → true` no mesmo tick: 0 mutações no DOM.
- Lista: inserir no início move 1 nó; editar 1 campo executa só os bindings daquele item.
- Early return: nunca lança ao trocar `user` para `null`.
- `set` com valor igual: 0 effects.
- Tamanho por cenário medido com brotli no CI.
