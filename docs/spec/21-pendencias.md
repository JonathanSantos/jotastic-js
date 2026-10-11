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
| H-1 | happy-dom 15: `form.nextSibling` é `null` (Proxy) | **resolvido**: happy-dom 20; contorno removido (testes com `MutationObserver` + `await` passam a somar os registros entregues ao callback) |

## API pública (`index.ts`)

| # | Caso concreto | Provisório |
|---|---|---|
| I-1 | IDs fora de 12: `not-compiled` (marcador executado sem compilador: `Slot`, `external`, `pending`/`refresh` em valor comum) e `mount-target-missing` (`mount(<App/>, '#nada')`) | criados |
| I-2 | `mount(…, { onError: a, plugins: [app => app.onError(b)] })` | todos chamados em ordem; se um lança, os seguintes são pulados e vai para `console.error`. Decidir: todos ou o último vence |
| I-3 | `<Ctx.Provider value={x}>` com `x` reativo | `value` lido 1×; consumidores não atualizam (funciona com objeto de getters) |
| I-4 | `external` fora de corpo reativo | marcador `not-compiled` (alternativa: proxy lazy) |
| I-5 | Typecheck dos exemplos usa `test/types/jotastic.d.ts`, não `src/index.ts` | divergência real × contrato não aparece; migrar quando estável |
| B-1 | tsup DTS falhava com `import _JSX = JSX` em `jsx-runtime.d.ts` | `public-types.ts` importa `jotastic/jsx-runtime` (self-reference) e o tsup o marca como external |

## ESLint plugin (passo 8)

| # | Caso concreto | Provisório |
|---|---|---|
| E-1 | 13 pede `prefer-const` desligado "para corpos reativos"; flat config só filtra por arquivo | desligado em todo `.ts/.tsx` coberto |
| E-2 | Fix de `state-read-in-setup` gera `watch(() => …)` sem importar `watch` | assim (vem do analyzer) |
| E-3 | `recommended` impõe `@typescript-eslint/parser` (dep direta) | assim |
| E-4 | Hints viram `'warn'` (aparecem também na CLI/CI) | assim |
| E-5 | URL de docs das regras aponta para repositório hipotético `jotastic/jotastic` | trocar quando houver repo |

## Compilador, parte 1 (passo 5)

| # | Caso concreto | Provisório |
|---|---|---|
| K-1 | compiled/01 × 18 §13–14: (a) sem `data-jo` (18 §14 manda emitir em dev); (b) `createRoot(document.querySelector('#app'), …)` vs `mount(thunk, '#app')`; (c) importa `untrack`/`createRoot` sem usar; (d) loc `Counter.tsx:27:7`, o `mount` está na linha 26 | compilador segue 18; allowlist explícita no snapshot |
| K-2 | 18 §4: `onMount`/`onCleanup`/`untrack`/`tick`/`raw` "mapeados para os do runtime" × §14 "continuam importados de `jotastic`" | segue §14 |
| K-3 | M-1 (select) | `prop(select, 'value')` emitido depois dos bindings dos filhos |
| K-4 | 18 §7: `{a ? X : Y}` → `branches` sempre, mas compiled/02 usa `insert` num ternário de strings | fluxo só quando X/Y têm JSX |
| K-5 | Prop de componente com identificador `let` comum (ex.: `let` de `ref`) vira valor capturado na criação (§6) | assim; getter seria mais correto |
| K-6 | `textContent`/`innerHTML`/`indeterminate` literais → `prop(el, n, () => lit)`; `defaultValue`/`defaultChecked` literais → atributos `value`/`checked`; `const { a } = derivado` → `_a = memo(…)`, lido `_a.get().a` | assim |
| K-7 | `external` em dev: completa args ausentes com `undefined` para `dev` ficar na 4ª posição | assim |
| K-8 | Nome de helper colidindo com variável do usuário | `rest as _rest2` |
| K-9 | Modo plugin Babel gera aspas duplas; `compile()` gera simples | assim |

## Vite e tamanho (passo 6)

| # | Caso concreto | Provisório |
|---|---|---|
| V-1 | `DEV` sempre `true` no bundle do browser (`typeof process` não é substituído pelo Vite); regra 5 do guia pede exports condicionais `development`/`default` | **feito**: tsup gera `dist/dev` (`__DEV__=true`) e `dist/prod`; exports `development`/`default` |
| V-2 | Counter: **6813 B brotli** (limite 3 KB); com `DEV=false` forçado, 5673 B — proxy/arrayMethods entram via `signal`/`memo`/`state`; helpers `__publicField` do target padrão do Vite | **parcial**: prod 3335 B (dev 6422 B). Limite ajustado provisoriamente para 3,5 KB (19 permite até o M8). Para chegar a 3 KB: helper de texto escalar (`text(node, read)`, ~200 B) no lugar do `insert` genérico — exige API nova no contrato, decisão pendente |
| V-3 | 19 pede `size.test.ts` | feito como `scripts/size.mjs` (`npm run size`) |
| V-4 | Plugin Vite: `.ts` só compila se uma regex barata acha declaração `use*`; `autoImport` e `hmr.preserveState` não implementados; `devtools` só flag | assim |

## Compilador, parte 2b (`use*` e slots)

| # | Caso concreto | Provisório |
|---|---|---|
| U-1 | **Aridade de `use*` importada**: `import { useFetch } from './useFetch'; useFetch('/x')` → o chamador não sabe de `init`, não passa thunk, e o corpo chama `init()` → TypeError. No mesmo módulo o compilador completa com `() => undefined` (como no compiled/03) | **bug aberto**. Proposta: o corpo do `use*` normaliza parâmetros ausentes (`init ??= () => undefined` ou leitura `init?.()`) |
| U-2 | Rest em `use*`: 18 diz "array de getters" | leitura de `args` devolve valores (`args.map(g => g())`) |
| U-3 | `{x ? <Slot name="h"/> : <i/>}`: 18 §12 não diz para onde vai o lado sem slot | `not-implemented` |
| U-4 | Escrita em parâmetro de `use*` (`url = x`) | não reescrita |
| U-5 | `useX(...xs)` | `not-implemented` |
| U-6 | Snapshots 03/06: locs do compiled supõem um arquivo por função e alguns não batem com nenhuma versão do exemplo; 06 declara templates no meio do módulo; template estático `() => _tN()` vs `{ const _el = _tN(); return _el }` | allowlist explícita nos testes |

## Compilador, parte 2a (fluxo e listas)

| # | Caso concreto | Provisório |
|---|---|---|
| K-10 | Texto só de espaço encostado em `{/* comentário */}` | não vira nó de texto (compiled/02 pressupõe; React manteria) |
| K-11 | **Lista fora de filho de elemento intrínseco**: `<Card>{items.map(i => <Row/>)}</Card>`, fragmento, dentro de condicional | vira accessor comum (recria tudo, `i` número); `const rows` fora de posição de filho → `not-implemented`. Sem solução limpa sem API nova: proposta `list(null, marker, …)` lendo `marker.parentNode` a cada reconcile + âncora emitida pelo compilador |
| K-12 | Valor não-JSX dinâmico num caso: `{name \|\| <i>anon</i>}`, 18 §7 diz `() => a'` mas o render é untracked | emitido `() => () => a'` (accessor vivo) |
| K-13 | Mini-corpo do item de lista classificado pelo compilador (analyzer não classifica callbacks); `({ name }) => <li>{name}</li>` lê 1× (ver L-1); prelude de caso não classificado | assim |
| K-14 | Filho único condicional de componente: `get children() { return x && <p/> }` sem `branches` | **feito** (`get children() { return branches(…) }`) |
| K-15 | compiled/02 omite `!!` em `todo.editing`; omitido só quando a condição é booleana pela sintaxe | allowlist |

## Devtools (flash + contadores)

| # | Caso concreto | Provisório |
|---|---|---|
| W-1 | Injeção do devtools pelo plugin Vite: "dev" = `!isProduction`, mas no vitest `NODE_ENV=test` deixa `isProduction` falso e o `vite build` injetava | exige também `command === 'serve'`; `vite build --mode development` não leva devtools |
| W-2 | `@jotastic/devtools` não é dependência do `@jotastic/vite`; o app precisa instalá-lo | assim |
| W-3 | `flush:end` não traz contagem de memos | contados por `memo:run` desde `flush:start` |
| W-4 | Painel de Atualizações, Alt+clique, lista de `inspect` | não feitos |

## Compilador, parte 3 (`await`)

| # | Caso concreto | Provisório |
|---|---|---|
| W-5 | `const n = (await f()).length`, `<p>{await x}</p>`, `const a = await f(), b = 1`, `for await` | `not-implemented` (spec cobre só `const x = await EXPR` e `await EXPR;`) |
| W-6 | `await` dentro de `use*` (18 §11 não fala) | `not-implemented` |
| W-7 | `pending(y)` com `y` que não vem de `await` | deixado como está; em runtime lança `not-compiled` (I-1). Sem ID de diagnóstico em build |
| W-8 | compiled/05 importa `Boundary` como implementação ilustrativa; omite dev meta em `component(Skeleton)` | allowlist |

## Exemplos (passos 6/7)

| # | Caso concreto | Provisório |
|---|---|---|
| X-7 | TodoMVC prod: **6872 B brotli** (limite 19: 6 KB) — proxy/arrayMethods, list, branches, twoWay | limite provisório 7 KB (19 permite ajuste até o M8); enxugar o runtime |
| X-8 | Componente com ≥ 2 filhos fora de `<Slot>` + um `<Slot>` → compilador cai com `ReferenceError: Container is falsy` (`place()` em `emit/module.ts`); 10-modal cai nisso | **corrigido** (`place()` pede nova rodada de travessia) |
| X-9 | 10-modal: `ref={input}` sem `onCleanup`, `ref={dialog}` com; `input` fica apontando para nó destacado após fechar | **decidido**: `ref` dentro de children/slots de componente também ganha `onCleanup` (18 §5.3 só lista branch/lista/continuação: atualizar texto) |
| X-10 | Exemplos ajustados: cart/styling `createStore<State>` (T-4), slots cast `SlotFn` (T-5), styling `String(c.v)`/`type` no lugar de `interface extends` | marcados `// [ajuste]` |

## HMR e sourcemaps (passo 8)

| # | Caso concreto | Provisório |
|---|---|---|
| H-2 | APIs internas fora do contrato: `__hmrComponents(file, comps, opts)`, `__hmrResetRegistry()` em `jotastic/runtime`; `__hmrStores(data, stores, reset?)` em `jotastic/store`; `DevMeta.hash`; opção `hmr` em `compile()` | criadas (dev only); formalizar no contrato |
| H-3 | Em dev com HMR, componente exportado devolve accessor (1 efeito a mais por instância) | só dev |
| H-4 | `preserveState` não cobre `let` em continuação/branch, `let` desestruturado; `let` de `use*` com mesmo nome de um do componente colide | assim |
| H-5 | Store preservado só em `export const x = createStore(` (regex); módulo de store não se auto-aceita (a atualização sobe para os componentes) | assim |
| H-6 | Componentes não exportados não são registrados (trocados só quando o pai exportado remonta) | assim |
| X-11 | `examples/async`: **8911 B brotli** (~7 KB de runtime: resource, continuation, Boundary, list, proxy); 19 não define limite para esse cenário | limite informativo provisório 9 KB |
| X-12 | Analyzer avisa no próprio exemplo oficial 06-async: `continuation-state-resets` em `let onlyPublished` (intencional) e `prefer-key-in-list` em `results.map` | mantidos |

## Benchmark (passo 6)

`npm run bench` (Chrome do sistema, mediana de 10). Jotastic vs Solid: create 1k 1.12×, replace 1k 1.32×, update 10th 1.20×, **select 3.8×**, **swap 8.5×**, remove 1.08×, create 10k 1.05–1.13×, append 1.22×, clear 1.41×. Limiar +10% falha em 8/9.

| # | Caso concreto | Provisório |
|---|---|---|
| G-1 | Swap rows: `list()` sem LIS move ~997 `<tr>` (Solid move 2) | LIS (previsto "pós-MVP" no contrato) |
| G-2 | Select: um efeito `classList` por linha → 1000 efeitos por seleção; Solid usa `createSelector` | sem equivalente no contrato; decidir se entra API/otimização de compilador |
| G-3 | Clear/replace: remoção nó a nó; Solid usa `textContent = ''` quando a lista esvazia e é o único conteúdo | fast path |
| G-4 | Append: `push` via proxy + `Array.from` + passe completo de chaves | otimizar |
| G-5 | **D29 (delegação)**: sem listeners por linha, create 10k melhora ~7% (< 10%); `add/removeEventListener` = 1,6% do profile | **delegação não se justifica** |
| G-6 | Ruído: Solid create 10k varia 8% entre execuções (~ o limiar) | limiar instável em CI; mais runs ou margem em ms |
