# 21 — Pendências

Lacunas e conflitos encontrados durante a implementação, com o caso concreto e o que foi feito por ora. Cada item precisa de decisão; até lá vale a solução provisória descrita.

## Tipos (jsx.d.ts / jotastic.d.ts)

| # | Caso concreto | Provisório |
|---|---|---|
| T-1 | `JSX.Element = Node \| Node[] \| …` rejeita filhos mistos: `<p>{count} (dobro: {double})</p>`, `{items.map(...)}` (TS2322) | `Element[]` recursivo no lugar de `Node[]` |
| T-2 | `on${Capitalize<K>}` gera `onDblclick`/`onKeydown`; 05-jsx e exemplos usam `onDblClick`/`onKeyDown` | tabela `CamelEventNames` para eventos compostos |
| T-3 | `EventHandler` usa `target: Element`, que dentro de `namespace JSX` resolve para `JSX.Element` | `globalThis.Element` |
| T-4 | `createStore((set, get) => ({ n: 1, inc: () => set(s => ({ n: s.n + 1 })) }))` não infere `S` (fica `object`); 05-styling e 08-store não compilam como escritos | contrato mantido; cópias de teste usam `createStore<State>(…)`. Decidir: exemplos com tipo explícito ou outra assinatura (curried à la zustand) |
| T-5 | `Slots<N>` tipa slot como `JSX.Element \| SlotFn`; `slots.row(item)` (13-slots:28) não é chamável porque `JSX.Element` inclui string | cast `(slots.row as SlotFn)`. Sugestão: declarar quais slots são funções |
| T-6 | `EventMapOf` não exportado no contrato | exportado |

## Exemplos com erro de tipo próprio (contornados em `packages/jotastic/test/types/patched/`)

- 05-styling:78 `interface … extends JSX.IntrinsicElements['button']` (TS2499) → `type … &`.
- 05-styling:64 `title={c.v}` com `number`, contrato pede `string`.
- 06-async:2/93 `import { api }` conflita com `declare const api` (TS2440).
- 06-async:18,27 e 10-modal:56: erro `unknown` usado como `Error` (`e.message`).

## Núcleo reativo (passo 1)

| # | Caso concreto | Provisório |
|---|---|---|
| N-1 | Ordem do flush: efeito user que agenda um de render | sempre roda o render de menor id antes de voltar à fila user (refina "render inteira, depois user, repetindo"; R13 ok) |
| N-2 | `effect-loop` na 101ª execução | vai para `handleError(owner, err, 'effect')`; efeito volta a CLEAN, segue assinado; `flush()` não lança |
| N-3 | `use-outside-owner` em dev: lançar ou não? | `handleError(null, …)` (console.error / relança em teste); o efeito é criado |
| N-4 | `onCleanup` dentro de `watch` | registra no owner (não no efeito): acumula a cada reexecução. Decidir se efeito deve ser escopo de cleanup |
| N-5 | Efeitos/memos criados dentro de um efeito | pertencem ao owner do efeito pai e acumulam em reexecuções; só branch/item/continuação criam owners próprios |
| N-6 | Memo com erro | erro guardado e relançado em cada `get()`; recupera quando a fonte muda |
| N-7 | `handleError` | usa o `onError` do ancestral mais próximo; se `boundary.catch` lançar, sobe; erro em cleanup usa fase `'effect'` |

## External e props (passo 3)

| # | Caso concreto | Provisório |
|---|---|---|
| X-1 | `external(create, update)`: `update` roda logo após `create` no mesmo flush (precisa rodar 1× para coletar deps); ex.: `chart.update()` logo após `new Chart` | assim |
| X-2 | `set` do Signal devolvido por `external` não definido | escrita simples, sem destruir |
| X-3 | `useContext` sem provider nem default: sem ID em 12; `createContext()` ≡ `createContext(undefined)` | id `context-missing`; `provide` fora de owner → `use-outside-owner` |
| X-4 | "devtools mostra o método de destruição" sem evento em devtools.d.ts | nada emitido |
| X-5 | `external(() => store.subscribe(…))` devolvendo função de unsubscribe | não chamada (spec só lista métodos) |
| X-6 | embrulho de handler duplicado entre `on` (external.ts) e `listen` (dom.ts) | unificar depois que dom.ts existir |

## DOM e root (passo 3)

| # | Caso concreto | Provisório |
|---|---|---|
| M-1 | `<select value={plan}>{opts.map(…)}</select>`: `prop` roda antes do `list` criar as `<option>`, valor não pega | sem re-aplicação; decidir (ex.: compilador emite `prop` de select depois dos filhos) |
| M-2 | `prop('value', array)` em `select multiple` | marca `option.selected` por valor |
| M-3 | "accessor aninhado, memoizado" no `insert` | chamado a cada execução; memo fica com `branches`/`children` |
| M-4 | `spread` com chaves que mudam sempre: efeitos por chave descartados ficam na lista do owner (ver N-5) | assim |
| M-5 | `style` número 0 | `'0'` sem px; lista própria de propriedades de comprimento |
| M-6 | `style` string → objeto | zera `cssText` antes |
| M-7 | `spread` em SVG | chaves comuns viram `attr` |
| M-8 | `checked` no `spread` | sempre `prop`, inclusive radio |
| M-9 | `createRoot` em alvo com filhos | não apaga; anexa depois |

## Proxy (passo 2)

| # | Caso concreto | Provisório |
|---|---|---|
| P-1 | `arr[0] = novoObj` precisa reexecutar efeito que faz `arr.map(...)` (assina só `$iter`) | troca de índice notifica o índice **e** `$iter` |
| P-2 | `o.list = o.list.filter(...)` grava array com proxies; `includes(rawItem)` falharia | busca tenta arg, `raw(arg)` e `reactive(raw(arg))` |
| P-3 | `raw`/`isReactive` sobre proxy readonly (resultado de memo em dev) | atravessam o readonly, para dev ≡ prod |
| P-4 | `push`/`sort` em array readonly | um aviso por escrita (sem dedupe) |
| P-5 | 11-runtime cita `Map.has` comparando raw e proxy, mas `Map` nunca é proxiado | não implementado |
| P-6 | signals internos por chave emitem `signal:create/set` sem nome no devtools | assim; rever no painel |

## @jotastic/test

| # | Caso concreto | Provisório |
|---|---|---|
| Q-1 | Rethrow do root sem `onError`: `setRethrowUnhandled` não é exportado de `jotastic/runtime` | o hook de devtools relança no evento `error` com `handledBy: 'console'` (só dev). Decidir subpath interno |
| Q-2 | 13-tooling mostra `counts()` como `{ bindings, memos }`; 19 usa `{ effects, memos, writes }` | seguido o 19 |
| Q-3 | Erro não tratado em flush assíncrono relança em microtask; `tick()` não rejeita | assim |
| Q-4 | `counts().writes` não conta escritas do setup fora de efeitos | assim |

## Store e fetch (passo 7, adiantado)

| # | Caso concreto | Provisório |
|---|---|---|
| S-1 | S4 ("cada `set` após `await` é um flush próprio") só é atingível com flush síncrono: dois `set` no mesmo microtask dividiriam o flush | ações e `set` fora de ação terminam com `flush()` síncrono (exceto dentro de outro batch/flush). Diverge de "DOM no microtask" para stores: `cart.add(x)` já atualiza o DOM ao retornar |
| S-2 | `set` após `await` não é atribuível à ação (sem contexto async) | devtools emite `store:action` com `action: 'set'`; `$reset` como `'$reset'` |
| S-3 | `get().x = 1` após `await` está fora da ação | avisa e não muda; só `set` funciona |
| S-4 | `$snapshot()` tipado `S` | estado + valores dos getters, sem ações |
| S-5 | `fetch` com `init.signal: null` | tratado como ausente (anexa o ambiente) |

## Analyzer (passo 4)

| # | Caso concreto | Provisório |
|---|---|---|
| A-1 | **`signal` vs `state`**: 18 §3 exige todas as atribuições "provavelmente primitivas". Por ela, `filter = f` (02-todos), `error = e` (compiled/03), `let matches = mql.matches` (useMediaQuery), `tab = t` (compiled/04) são `state`, mas o compiled usa `signal`; e o compiled usa `state` para `data = d`, de forma idêntica a `error = e`. Nenhuma regra sintática reproduz o compiled | analyzer segue 18 §3 (`state`); semanticamente equivalente para primitivos. Decidir: ajustar a regra ou os snapshots |
| A-2 | Contexto vivo não listado em 18 §2: objeto de retorno de `use*`; corpo de funções raiz referenciadas em contexto vivo (`{label()}`), transitivamente | tratados como vivos (senão `let` lido só por `label()` vira `plain`) |
| A-3 | Two-way (`value={draft}` sem handler) | conta como escrita (evita `let-never-reassigned` falso); `select multiple` força `state` |
| A-4 | Contrato: fix de `inner-html-object`/`state-read-in-setup` precisa do código-fonte | `AnalyzeOptions.code?` opcional; `topLevelJSX` aceita `JSXFragment` |
| A-5 | Kind `'continuation'` nunca emitido (18 §3: mesma classificação; usa `flowIndex`); `branchIndex` = posição na cadeia if/else-if/switch; `else`/`default` → `{ kind: 'final' }`; `await` com declarador recebe `flowIndex` anterior | assim |
| A-6 | `ParamInfo` sem campo da chave: `{ c: local }` registra só `local` | compilador lê a chave no nó |
| A-7 | `loc` com coluna 1-based (como `Counter.tsx:5:7`) | ESLint subtrai 1 |
| A-8 | `isProbablyPrimitive`: `a ?? 0` primitivo, `a \|\| {}` não; ternário exige os dois lados | assim |
| A-9 | `watch-without-reads` só dispara se o callback não referencia nenhum binding não-global (evita falso positivo com stores) | assim |
| A-10 | `state-read-in-setup` dispara no exemplo oficial 11-tabs (`tabs.register(id)`) | talvez exceção para `useContext` |
| A-11 | Exemplos que não parseiam no Babel: 06-async e 12-react-vs (import `api` + `declare const api` → "Duplicate declaration"); 05-styling (`extends JSX.IntrinsicElements['button']`) | testes contornam |

## Fluxo (passo 3)

| # | Caso concreto | Provisório |
|---|---|---|
| L-1 | **Dados velhos no item**: chave padrão `id` preserva a linha ao reatribuir o array com objetos novos (F8), mas `render(item)` capturou o objeto antigo. Ex.: `users = await refetch()` com mesmos ids → nós preservados, bindings leem dados antigos | assim (contrato passa `item` direto). Decidir: item como accessor/signal, recriar quando a referência muda, ou reconcile (fase 2, D24) |
| L-2 | `list:recreated` ao esvaziar a lista ("Limpar concluídas") | só emite se a lista nova tem ≥ 1 item |
| L-3 | Chave duplicada sem ID em 12 | `list-duplicate-key` |
| L-4 | Erro dentro de `render` de branch/item/portal | `handleError(owner, e, 'setup')`, conteúdo null |
| L-5 | Mover o último item para o início move n−1 nós | LIS pós-MVP |
| L-6 | `children()` cria os nós ao ser chamado (inclusive por `slots`): perde a preguiça prometida em 02 | assim |
| L-7 | `Rendered` rejeita arrays mistos (`[component(…), branches(…)]`), como T-1 | cast nos testes |

## Async (passo 9, runtime)

| # | Caso concreto | Provisório |
|---|---|---|
| Y-1 | `resource` cuja `fn` lança síncrono no meio do setup: boundary descarta os children enquanto o componente monta; continuações criadas depois ficam em owner descartado | funciona, deixa efeito órfão |
| Y-2 | `await sleep()` (valor `undefined`) | continuação considera pronto por `loading === false && error === undefined`; `throw undefined` não é erro |
| Y-3 | Descendente async novo depois do primeiro carregamento (branch troca para componente com `await`) | boundary volta a pending (segue o memo do contrato; 07 fala só em primeiro carregamento) |
| Y-4 | `await`s aninhados: children entram e saem do DOM no mesmo flush | sem pintura intermediária, mas há mutações |
| Y-5 | Erro síncrono de `fn` | fase `'async'` |

## Compilados à mão rodando no runtime (passo 3)

| # | Caso concreto | Provisório |
|---|---|---|
| C-1 | 19 §Compilador: "marcar 1 item → `effects: 1`". Pelo próprio compiled/02 o mínimo é 4 (classList do li, `prop checked` que roda sem escrever, `{remaining}`, `{remaining === 1 ? …}`), +2 no primeiro item marcado (branch "Limpar concluídas") | teste afirma `effects: 4` e 1 escrita no `<ul>`. Decidir se a tabela conta só o li |
| C-2 | compiled/03 `useMediaQuery`: `memo(() => matchMedia(query()))` devolve instância → `derived-recreates-instance` a cada troca; ao trocar a query, `matches` fica com o valor antigo até um `change` | documentado no teste |
| C-3 | compiled/06: `items` não declarado | declarado no teste |
| C-4 | compiled/02 não emite `autofocus()` no input raiz (coerente com 18 §5.6) → montado pelo runtime, sem foco | assim |
| C-5 | **Readonly de derivado (P11)** profundo bloqueava `todo.done = v` em itens vindos de `visible` (02-todos) | `derived-mutated` só protege objetos criados pelo derivado; estado reativo aninhado passa. Readonly de store continua profundo |
| Q-5 | `@jotastic/test`: trocar `__JOTASTIC_DEVTOOLS__` depois da instalação → reinstala por cima e conta em dobro | assim |
| H-1 | happy-dom 15: `form.nextSibling` é `null` (Proxy) | contorno em `packages/jotastic/test/setup/happy-dom-form.ts`; happy-dom 20 corrige → atualizar e remover |
