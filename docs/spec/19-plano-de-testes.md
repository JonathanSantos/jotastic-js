# 19 — Plano de testes

Três camadas, todas em Vitest. Os testes de contrato são a definição de pronto de cada marco.

```
packages/jotastic/test/
├─ reactive.test.ts      núcleo (signal/memo/effect/scheduler)
├─ proxy.test.ts         objetos reativos
├─ dom.test.ts           template/insert/attr/classList/style/spread/listen/twoWay
├─ flow.test.ts          component/keyed/branches/list/slots/portal
├─ async.test.ts         resource/continuation/boundary
├─ external.test.ts      external/on/onMount/inspect
├─ store.test.ts         createStore
└─ compiled/             executa docs/spec/compiled/*.js contra o runtime (M1)
packages/analyzer/test/
├─ classify.test.ts      tabela de classificação (entrada → BindingKind)
├─ flow.test.ts          early return / await → FlowNode[]
└─ diagnostics/<id>/     um fixture por ID (input.tsx + expected.json)
packages/compiler/test/
├─ fixtures/<caso>/input.tsx + output.js      snapshots (começa com docs/spec/compiled)
└─ behavior/             compila + executa em happy-dom + conta execuções
```

Ambiente: `happy-dom`. Helper `counts()` do `@jotastic/test` devolve `{ effects, memos, writes }` desde o último reset, alimentado pelo hook de devtools em modo teste.

## Núcleo reativo (M1)

| # | Teste | Asserção |
|---|---|---|
| R1 | `set` com valor igual | 0 efeitos executados |
| R2 | `count++; count` | leitura devolve o novo valor antes do flush |
| R3 | memo lido depois de `set`, antes do flush | já recalculado |
| R4 | memo com resultado igual (`Object.is`) | efeito dependente não roda |
| R5 | memo devolvendo array shallow-igual | efeito dependente não roda |
| R6 | memo sem leituras reativas | `constant === true`; `fn` roda 1 vez; `get()` 1000× não chama `fn` |
| R7 | memo executa na criação | efeito colateral em `fn` visível antes de qualquer `get()` |
| R8 | `a=1; b=2` no mesmo tick | 1 flush, efeito que lê a e b roda 1 vez |
| R9 | diamante (a → b, a → c, d lê b e c) | d roda 1 vez, sem glitch (nunca vê b novo com c velho) |
| R10 | efeito que escreve no que lê | lança `effect-loop` após 100 execuções; a aba não trava |
| R11 | efeito de render | primeira execução síncrona na criação |
| R12 | efeito user | não roda na criação; roda no primeiro flush |
| R13 | ordem no flush | render ids crescentes, depois user ids crescentes |
| R14 | efeito criado durante o flush | roda no mesmo flush |
| R15 | dispose de owner no meio do flush | efeitos do owner pendentes são pulados |
| R16 | cleanup | roda antes da reexecução e no dispose, em ordem reversa |
| R17 | dependências recoletadas | depois de `cond=false`, mudar `b` (lido só no branch true) não roda o efeito |
| R18 | `untrack` | leitura dentro não assina |
| R19 | `tick()` | resolve depois do flush |
| R20 | `abortSignal()` em efeito | aborta no cleanup; fora de efeito/recurso devolve signal não abortado |

## Objetos reativos (M1)

| # | Teste | Asserção |
|---|---|---|
| P1 | `reactive(x) === reactive(x)`; `reactive(proxy) === proxy` | identidade |
| P2 | ler `o.a.b` assina só `b` | mudar `o.a.c` não roda o efeito |
| P3 | `o.a = mesmo valor` | 0 efeitos |
| P4 | `arr.push(x)` | efeito que itera roda 1 vez; efeito que lê `arr[0]` não roda |
| P5 | `arr[0].done = true` | só o efeito que lê `arr[0].done` roda |
| P6 | `o.a = { novo }` | troca referência; `antigo` continua com os valores antigos (sem reconcile) |
| P7 | `arr.includes(rawItem)` e `arr.includes(proxyItem)` | ambos `true` |
| P8 | classe, `Map`, `Date`, DOM node | passam intactos (`isReactive === false`) |
| P9 | `raw(obj)` antes de `reactive` | nunca proxiado; `raw(proxy)` devolve o alvo |
| P10 | `sort()`/`splice()` | 1 flush; `$iter` notificado |
| P11 | dev: escrever em `readonly` | aviso com id e loc; valor não muda |
| P12 | `JSON.stringify(proxy)` | igual ao do raw |
| P13 | `delete o.a` | notifica `a` e iteração |

## DOM (M2–M3)

| # | Teste | Asserção |
|---|---|---|
| D1 | `template('<div class="a"><b>oi</b></div>')()` | clone profundo, 1 parse por template |
| D2 | `insert` com string → number → null → nó → array | DOM correto a cada troca; Text reutilizado entre string e number |
| D3 | `insert` com mesmo texto | 0 escritas (`MutationObserver`) |
| D4 | `insert` com accessor aninhado (função) | resolvido |
| D5 | `attr` com `false`/`null` | atributo removido |
| D6 | `bool('disabled')` | atributo presente/ausente |
| D7 | `prop('value')` com valor igual | não escreve (caret preservado: `selectionStart` mantido) |
| D8 | `classList` objeto/array/string | só adiciona/remove o diff; classes estáticas do template intactas |
| D9 | `style` objeto | `setProperty`/`removeProperty` por chave; camelCase → kebab; `--var`; número → px |
| D10 | `listen` | `currentTarget` correto; `stopPropagation` impede o pai; handler que lança vai para `handleError`; promise rejeitada idem |
| D11 | `twoWay` por kind | digitar atualiza o signal com a coerção certa (`number` NaN → null; `multiple` → array) |
| D12 | `spread` | chaves que somem são removidas; `value` com setter e sem handler vira two-way |
| D13 | `template(html, true)` | elementos no namespace SVG |

## Fluxo (M4)

| # | Teste | Asserção |
|---|---|---|
| F1 | `branches` alternando N vezes | N instâncias criadas/descartadas; contagem de assinantes dos signals volta a 0 |
| F2 | `true → false → true` no mesmo tick | 0 mutações no DOM |
| F3 | condição muda de valor sem mudar de caso (`user` objeto A → objeto B) | branch não recriado; bindings internos atualizam |
| F4 | **top-down**: `user → null` com continuação lendo `user.name` | nenhuma exceção; continuação descartada antes do binding rodar |
| F5 | `list`: inserir no início | 1 nó inserido; os outros `isSameNode` |
| F6 | `list`: mover item | nó movido (mesma referência), `index()` atualizado |
| F7 | `list`: editar 1 campo | só os bindings daquele item rodam (`counts().effects === 1`) |
| F8 | `list`: chave padrão `id` | reatribuir array com mesmos ids e objetos novos preserva nós **e** os bindings mostram os dados novos (D58) |
| F17 | `selector` | mudar a seleção roda só os efeitos das linhas antiga e nova (`effects: 2`) |
| F18 | `list(null, marker, …)` | lista em children de componente reconcilia no pai atual |
| F9 | `list`: todos removidos e novos | evento `list:recreated` |
| F10 | `list` de primitivos | mudar valor na posição recria só aquela linha |
| F11 | `keyed` | mudar key recria; mesma key não |
| F12 | `slots` | `default`, nomeado, com parâmetro, condicional reativo |
| F13 | `portal` | nós no alvo; contexto e erro vão para o owner de origem; removidos no dispose |
| F14 | `children` | `props.children` lido 2× cria nós 1× |
| F15 | owner dispose | cleanups em ordem reversa; filhos antes do pai |
| F16 | `component` com erro no setup | `handleError(phase 'setup')`; vizinhos continuam |

## Async (M7)

| # | Teste | Asserção |
|---|---|---|
| A1 | `resource` com `props.id` mudando antes de resolver | resposta antiga ignorada; controller antigo abortado |
| A2 | `loading` só até o primeiro valor; `pending` nas recargas | valores corretos em cada fase |
| A3 | `continuation` | `fn` roda 1 vez; refresh não recria; `value` novo atualiza só o binding |
| A4 | `boundary` com 2 recursos | `pending` até os dois resolverem; depois children |
| A5 | `boundary` erro de `await`, de handler sync, de handler async, de efeito | todos capturados; `retry` recria e refaz |
| A6 | `boundary` sem `error` | erro sobe para o próximo / root `onError` |
| A7 | `abortSignal()` dentro de função chamada por `fn` | é o signal do recurso; após `await` interno, volta ao "nunca aborta" |
| A8 | `let x = await` + `x.name = 'y'` | binding atualiza; refresh traz valor do servidor |
| A9 | dispose do owner com requisição em voo | abortado; nenhum `set` posterior |

## Externo (M4)

| # | Teste | Asserção |
|---|---|---|
| E1 | `external(create, update)` | create 1×, update a cada mudança, destroy no dispose |
| E2 | `external(create)` com dependência | destroy + create ao mudar |
| E3 | destruição automática | chama `destroy`/`dispose`/`disconnect`/`unsubscribe`; `close` só em WebSocket etc. |
| E4 | `on` com alvo lazy | re-liga quando o alvo muda; remove no dispose; alvo `undefined` → nada |
| E5 | `onMount` | roda 1× depois do DOM, vê refs |

## Store (M5)

| # | Teste | Asserção |
|---|---|---|
| S1 | ação síncrona com 3 `set` | 1 flush |
| S2 | `set` objeto / fn com retorno / fn mutadora | mesmo resultado; só assinantes das chaves mudadas rodam |
| S3 | getter | memoizado; recalcula só quando o que lê muda |
| S4 | ação async | `set` após `await` funciona sem contexto de ação; efeitos veem o valor final no próximo microtask; 2 `set` no mesmo microtask = 1 flush (D61) |
| S5 | mutação fora de ação (dev) | aviso `store-mutated-outside-action` |
| S6 | `$snapshot`/`$reset` | cópia sem proxy; volta ao inicial |

## Analyzer (M2+)

- `classify.test.ts`: uma linha por regra de [18 §3](18-transformacoes.md#3-classificação), incluindo os casos de borda: `let` só em handler → `plain`; `let x = null` depois `x = {}` → `state`; `const o = { a: 1 }` → `stateLiteral`; `const o = { a: x }` → `memo`; `const o = { get a() {} }` → `memoLiteral`; `const f = items.filter().map(i => <li/>)` → `list`; `const c = external(...)` → `external`; `const u = useX()` → `useResult`; `const x = await f()` → `resource`; `const x = CONST_IMPORT` → `plain`; `const x = store.total` → `memo` (candidato).
- `flow.test.ts`: `if/return`, `else if`, `switch`, prelude, `await` encadeado, early return depois de `await`, erros.
- `diagnostics/<id>/`: cada ID de [12](12-diagnosticos.md) com um `input.tsx` que dispara e um `expected.json` (id, level, loc, fix).

## Compilador (M2+)

- Snapshots: os seis arquivos de [compiled/](compiled/README.md) são os primeiros; cada regra de [18](18-transformacoes.md) ganha um fixture mínimo.
- Comportamento: para cada exemplo oficial, um teste que monta, interage e afirma `counts()`:

| Exemplo | Interação | Esperado |
|---|---|---|
| Counter | clique em +5 | `effects: 4` (text count, text double, classList, disabled); `Counter` não reexecuta |
| Todos | digitar 1 letra | `effects: 1` (prop value do input), lista intocada |
| Todos | marcar 1 item | efeitos **daquele** li: classList + prop checked (sem escrita); footer: text remaining + text "item/itens"; primeiro item marcado: +2 (branch "Limpar concluídas"). **Zero efeitos em outros itens**; `<ul>` sem escritas |
| Todos | adicionar item | 1 nó inserido; itens existentes `isSameNode` |
| Cart | `cart.add` | só `count`/`total`/linha nova |
| UserCard | `id` muda | 1 requisição nova, anterior abortada, texto do nome atualiza 1× |

## Tamanho e benchmark (M3+)

- `size.test.ts`: build de `examples/counter` e `examples/todomvc` com Vite + brotli; falha se > 3 KB / > 6 KB (ajustável até o M8, nunca acima de `≤ Solid`).
- `bench/`: js-framework-benchmark local; CI compara com o resultado salvo do Solid e falha se > Solid + 10% **e** > Solid + 2 ms, em 2 de 3 execuções (G-6).
- Limites provisórios até o M8: counter 3,5 KB (meta 3 KB com `text`), TodoMVC 7 KB, async 9 KB (informativo).
