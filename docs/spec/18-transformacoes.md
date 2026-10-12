# 18 — Regras de transformação do compilador

Algoritmo completo, na ordem em que o compilador o executa. Entrada: AST Babel (`jsx` + `typescript`). Saída: JS ESM + sourcemap. Tipos da análise em [contracts/analyzer.d.ts](contracts/analyzer.d.ts); saídas de referência em [compiled/](compiled/README.md).

## 1. Corpos reativos

| Forma | Condição | Nome |
|---|---|---|
| Componente | arquivo `.tsx`; função (declaração, arrow em `const`, `export default`) cujo nome começa com maiúscula **e** que contém ao menos um `return` de JSX (qualquer caminho) ou é `async` e retorna JSX | identificador |
| `use*` | `.ts`/`.tsx`; função declarada no escopo do módulo (ou `export const useX = (…) => …`) cujo nome começa com `use` seguido de maiúscula | identificador |

`Tabs.Tab = function Tab(…)` também é componente (atribuição a membro, nome em maiúscula). Funções aninhadas dentro de um corpo reativo **nunca** são corpos reativos.

## 2. Conjunto reativo e contextos vivos

**Escopo raiz** = o bloco da função, sem entrar em funções aninhadas, blocos de `if`/loops ou callbacks. Exceção: blocos de `if` que contêm `return` de JSX são parte do fluxo (§9).

**Bindings reativos** (`R`):
- parâmetros do componente (props) e de `use*`;
- `let` do escopo raiz classificado `signal`/`state`;
- `const` classificado `memo`, `memoLiteral`, `stateLiteral`, `resource`, `external`, `useResult`, `list`;
- parâmetros de callback de `.map` em lista (item: não reescrito, já é proxy; índice: reescrito para `i()`).

**Contexto vivo** (uma leitura aqui conta como "lida em contexto vivo"):
- expressões no JSX (`{…}`, atributos, props de componente);
- corpo do callback de `watch`, `inspect`, `external` (`create`/`update`), `on` (alvo);
- inicializador de `const` candidato a memo;
- argumentos de chamada a `use*`;
- condições de early return e expressões de `await` do corpo raiz.

Handlers de evento, `onMount`, `onCleanup` e funções aninhadas **não** são contexto vivo (leem o valor atual, mas não assinam).

## 3. Classificação

Para cada declarador do escopo raiz, nesta ordem (a primeira regra que casa vence):

```
if (await no inicializador)                              → 'resource'
if (ref={x} usa este let)                                → 'ref'   (variável comum; atribuída pelo template)
if (let):
  if (nunca lido em contexto vivo)                       → 'plain'
  if (isProbablyPrimitive(init) && todas as atribuições isProbablyPrimitive) → 'signal'
  else                                                   → 'state'
if (const):
  init é função/arrow                                    → 'function'
  init é JSX                                             → 'jsx'
  init é cadeia …map(fn) com JSX no corpo de fn          → 'list'
  init é chamada a `external(` de 'jotastic'             → 'external'
  init é chamada a função use*                           → 'useResult'
  init é literal objeto/array:
      tem getters                                        → 'memoLiteral'
      sem leituras reativas (§2) em nenhum valor         → 'stateLiteral'
      com leituras                                       → 'memo'
  init sem nenhuma leitura reativa e sem chamada e sem acesso a membro de import → 'plain'
  else                                                   → 'memo'  (candidato: o runtime decide)
```

`isProbablyPrimitive`: literal string/number/boolean/null/undefined, template literal, `!x`, `typeof x`, `-x`, `a op b` com op aritmético/comparação/lógico/`??`, chamada a método de string conhecido (`trim`, `toUpperCase`…), `x.length`. Na dúvida, `false` (emite `state`, sempre seguro).

Um declarador após um ponto de decisão (§9/§10) recebe `flowIndex` e é emitido dentro da continuação; a classificação é a mesma.

## 4. Reescrita de leituras e escritas

Aplicada em **todo** o corpo da função, inclusive closures, exceto onde um identificador foi sombreado por declaração local.

| Fonte | Saída |
|---|---|
| `x` (signal/state/memo/external/resource-let) | `x.get()` |
| `x = v` | `x.set(v)` |
| `x++` / `x--` / `++x` | `x.set(x.get() + 1)` (valor da expressão preservado quando usado) |
| `x += v` (e demais compostos) | `x.set(x.get() + v)` |
| `[a, b] = expr` com reativos | `const _t = expr; a.set(_t[0]); b.set(_t[1])` |
| `name` (prop desestruturada) | `props.name`; com default: `props.name ?? default` |
| `rest` (rest de props) | `_rest` onde `const _rest = rest(props, [chaves])` |
| `p` (parâmetro posicional de `use*`) | `p()` |
| `i` (índice de lista) | `i()` |
| `item` (item de lista) | `item()` (lazy, D58); `item.x = v` → `item().x = v`; `({ name }) =>` → `item().name` |
| `provide`/`<Ctx.Provider value={x}>` | `provide(Ctx, () => x')` (getter; D-I3) |
| `useX(a, b)` | `useX(() => a', () => b')` (cada argumento vira getter com as reescritas aplicadas dentro) |
| `pending(r)` / `refresh(r)` | `_rN.pending.get()` / `_rN.refresh()` (r deve ser `resource`, senão erro) |
| `abortSignal()` | inalterado (runtime ambiente) |
| `external(c, u, d)` | `external(c', u', d', dev)` (c/u/d com reescritas) |
| `on(t, e, h)` | `on(() => t', e, h')` |
| `watch(fn)` | `effect(fn', dev)` |
| `onMount(fn)` / `onCleanup(fn)` / `untrack` / `tick` / `raw` | inalterados, continuam importados de `jotastic` (§14) |
| `inspect(a, b)` | dev: `inspect(dev, () => a', () => b')`; prod: removido |
| `useSlots(children)` | `slots(props.children)` |
| `useContext(C)` / `createContext` | inalterados |
| JSX | §5–§8 |

Leituras de `let` classificado `plain` e de `ref` ficam como estão. Escritas em `const` são erro de TS, não do compilador.

## 5. JSX → template + bindings

### 5.1 Separação estático / dinâmico

Percorre a árvore JSX. Um nó é **estático** se é texto literal, ou elemento intrínseco cujos atributos são todos literais (string/number/boolean) e sem `ref`/`key`/eventos. Tudo o mais é dinâmico.

- Texto: segue as regras de whitespace do JSX do React (quebras de linha com indentação são removidas; espaços entre textos na mesma linha são mantidos). Textos adjacentes são mesclados. Escapar `<`, `&` e aspas na string do template.
- Atributos estáticos vão para a string HTML (`class="btn"`, `type="checkbox"`, booleano true → `disabled`). `class={{…}}`/`class={[…]}` com apenas literais é dobrado em string.
- Cada expressão `{…}` em posição de filho vira um marcador `<!>` no HTML, **exceto** quando é o único filho do elemento (então `insert(el, read, null)`).
- Se a expressão é `isProbablyPrimitive` ou uma leitura simples de signal/memo/prop com inicializador primitivo, emitir `text(marker, read)` em vez de `insert` (D64). Ternários com JSX em algum lado viram `branches`; ternários só de escalares são `text`.
- Cada atributo dinâmico vira um binding no elemento resolvido.

### 5.2 Resolução de nós

Depois de `const _el = _tN()`, cada nó que precisa de referência é alcançado pelo caminho mais curto com `firstChild`/`nextSibling` a partir do nó anterior já resolvido (nunca `childNodes[i]`, nunca `querySelector`). Um marcador `<!>` sucedido de texto estático ocupa um nó de comentário: o próximo irmão é o texto.

### 5.3 Tabela de atributos (`attributeKind(tag, name)`)

Normalização antes: `className` → `class` (aviso), `htmlFor` → `for` (aviso), nomes HTML minúsculos → nome canônico (`tabindex` → `tabIndex`, `readonly` → `readOnly`, `maxlength` → `maxLength`…), `dangerouslySetInnerHTML` → erro com fix para `innerHTML`.

| Nome | Kind | Emissão |
|---|---|---|
| `class` | class | `classList(el, read)` (as classes estáticas ficam no template) |
| `style` | style | `style(el, read)` |
| `ref` | ref | identificador: `x = el` (ou `x.set(el)` se o let é signal); função: `fn(el)`; em branch/lista/continuação: `onCleanup(() => x = undefined)` |
| `key` | key | tratado pelo pai (`keyed`/`list`) |
| `children` | children | só em componentes |
| `innerHTML`, `textContent` | innerHTML | `prop` |
| `value`, `checked`, `selected`, `muted`, `volume`, `currentTime`, `playbackRate`, `indeterminate`, `defaultValue`, `defaultChecked` | prop | `prop(el, name, read)` |
| `disabled`, `hidden`, `required`, `readOnly`, `multiple`, `autofocus`, `open`, `inert`, `checked`(atributo em radio), `novalidate`, `autoplay`, `controls`, `loop`, `playsinline`, `default`, `reversed`, `ismap`, `nomodule`, `allowfullscreen`, `async`, `defer` | bool | `bool(el, attrName, read)` (nome do atributo em minúsculas) |
| `on*` / `on:*` (ver §5.4) | event | `listen(el, type, handler, { capture })` |
| `data-*`, `aria-*`, SVG, desconhecidos, `id`, `title`, `type`, `name`, `placeholder`, `href`, `src`, `alt`, `for`, `role`, `tabIndex`→`tabindex`, `maxLength`→`maxlength`, … | attr | `attr(el, attrName, read)` |

Em `spread`, a mesma tabela é consultada em runtime por `attributeKind`.

`prop(select, 'value')` é emitido **depois** dos bindings dos filhos do `<select>` (as `<option>` precisam existir).

### 5.4 Eventos

`eventName(prop)`: `on` + Maiúscula → `prop.slice(2).toLowerCase()`; sufixo `Capture` → `{ capture: true }`; `on:` + nome → nome exato. `onDblClick` → `dblclick`, `onMouseEnter` → `mouseenter`. Emissão: `listen(el, type, handler', opts)`. O handler não é embrulhado pelo compilador (o runtime faz).

### 5.5 Two-way

Se o elemento é `input`/`textarea`/`select`, o atributo é `value` ou `checked`, **não** há `onInput`/`onChange`/`readOnly`/`disabled=true`-literal, e a expressão é `isAssignable` e não é prop → além do `prop(...)`, emitir `twoWay(el, kind, v => <expr> = v)` com `kind` da tabela de [17](17-contratos.md#two-way) decidido pelo `type` literal (`type` dinâmico ou ausente → `value`). Expressão não atribuível e sem handler → dica `value-not-writable`. `type="radio"` e `type="file"` nunca.

### 5.6 `autofocus`

Elemento com atributo `autofocus` dentro de branch, item de lista, continuação ou portal → emitir `autofocus(el)` além do atributo.

### 5.7 Fragmentos e múltiplos roots

`<>a b</>` e componentes que retornam vários nós: cada root vira um template próprio; o resultado é um array `[_t0(), _t1()]`. `{…}` solto entre roots vira um elemento do array via accessor.

### 5.8 SVG

Elemento `svg` ou descendente de `svg` (exceto dentro de `foreignObject`) → `template(html, true)`. Atributos SVG são sempre `attr`.

## 6. Componentes

`<Comp a="x" b={expr} c={fn} key={k} {...sp}>filhos</Comp>` →

```js
keyed(() => k', () => component(Comp, mergeProps({ a: 'x', get b() { return expr' }, c: fn' }, sp'), dev))
```

- Literal → valor. Expressão com leituras reativas, qualquer chamada/membro **ou identificador de `let`** (inclusive `ref`) → getter. Função/arrow → valor.
- Sem `key` → sem `keyed`. Sem spread → objeto literal direto (sem `mergeProps`).
- `children`: um filho JSX → `get children() { return <compilado> }`; vários → getter que devolve array; função (`{item => …}`) → valor; com `<Slot>` → §12.
- `ref` em componente: fase 2 (erro `component-ref-unsupported` no MVP).
- Componentes membros (`<Tabs.Tab>`) e dinâmicos (`<props.as>`) → `component(expr, …)`.

## 7. Condicionais

Em posição de filho:

| Fonte | Saída |
|---|---|
| `{a && X}` | `branches([[() => !!a', () => X']])` |
| `{a ? X : Y}` | `branches([[() => !!a', () => X']], () => Y')` |
| `{a ? X : b ? Y : Z}` | `branches([[() => !!a', () => X'], [() => !!b', () => Y']], () => Z')` |
| `{a \|\| X}` | `branches([[() => !!a', () => a']], () => X')` |
| `{{ k1: X, k2: Y }[s]}` (objeto literal de JSX indexado) | `branches([[() => s' === 'k1', () => X'], [() => s' === 'k2', () => Y']])` |
| `{cond && <Slot …>}` | §12 |

`X`/`Y` podem ser JSX, texto, `null`, ou qualquer expressão (nesse caso `() => expr'`). Em posição de **atributo**, ternários são expressões comuns dentro do `read`.

A emissão é sempre `insert(parent, branches(...), marker)`.

## 8. Listas

Detecção: expressão em posição de filho (ou inicializador de `const`) que é uma cadeia `SRC(.filter|.slice|.sort|.toSorted|.reverse|.toReversed|.flatMap)*.map(CB)` onde `CB` é arrow/função cujo corpo contém JSX no `return` (ou é expressão JSX).

Emissão: `list(parent, marker, () => SRC_CHAIN', (item, i) => BODY', key?, dev)`.

- `key`: se o elemento raiz do corpo tem `key={k}` → `(item, i) => k'` (com `item`/`i` em escopo) e o atributo é removido; senão omitido (padrão do runtime).
- O corpo do callback é compilado como um mini-corpo reativo: `const`/`let` dentro dele seguem §3 (`let` vira signal se lido no JSX do item).
- Parâmetro de item: **lazy** (D58), toda leitura vira `item()`. Parâmetro de índice: `i()`.
- **Seleção** (D63): se dentro do corpo há `A === B` / `A !== B` / `Object.is(A, B)` em contexto vivo onde um lado lê só bindings de fora da linha e o outro lê o item, emitir antes do `list`: `const _selN = selector(() => A')` e, na linha, `_selN(B')` (negado para `!==`).
- Pai: em children de componente, fragmento ou condicional, a lista não tem elemento pai fixo → o compilador emite uma âncora via `insert` do pai e chama `list(null, marker, …)` (D64).
- `.map` sem JSX no corpo é JS normal.
- `const rows = items.map(…)` → `const rows = list…`? Não: emite `const rows = () => …` como accessor usando um `DocumentFragment`? **Decisão:** `const` de lista vira uma função `_rows = (parent, marker) => list(parent, marker, …)` e o `{rows}` no JSX vira `_rows(parent, marker)`. Se `rows` for usado em mais de um lugar → erro `list-const-used-twice`.

## 9. Early return → `branches`

Algoritmo sobre o escopo raiz do corpo, em ordem:

1. Percorrer os statements. Um `if (cond) BLOCO` cujo bloco termina com `return X` (JSX/null) é um **ponto de decisão**. `else if`/`else` encadeados viram casos adicionais; `else` sem `if` com `return` vira fallback imediato (sem continuação).
2. `switch (expr)` cujos `case` terminam em `return` → casos `() => expr' === valor` na ordem; `default` → fallback.
3. Tudo antes do primeiro ponto de decisão é o **setup** (emitido no corpo da função).
4. Para cada ponto de decisão, os statements do bloco antes do `return` são o **prelude** (emitidos dentro do `render` do caso, antes do JSX).
5. Os statements **depois** do `if` até o próximo ponto de decisão ou o `return` final formam a **continuação**; ela é o fallback do `branches`, e é onde o próximo ponto de decisão (se houver) é aninhado recursivamente.
6. Declarações na continuação recebem `flowIndex` e são classificadas normalmente; emitir aviso `continuation-state-resets` para cada `let` ali.
7. Erros: `return` dentro de `for`/`while`/`do`/`try` do escopo raiz → `return-in-loop-or-try`. `if` com `return` cujo bloco não termina em `return` (retorno no meio) → tratar o restante do bloco como parte do caso (continua válido). `return` de não-JSX (string, número) é permitido e vira `() => valor`.

Saída: `return branches([[c1, r1], …], () => { continuação…; return <final> })`. Ver [compiled/04-user-page.js](compiled/04-user-page.js).

## 10. `await` → `resource` + `continuation`

Só `await` no **escopo raiz** (não em callbacks, não em `if` sem return). Para cada um, em ordem:

1. `const x = await EXPR` → `const _rN = resource(() => EXPR', dev)`. Dentro de `EXPR'`, leituras reativas assinam (o `resource` roda em efeito de render). `const x = f(await EXPR)` ou `(await EXPR).y` → o `await` é hoisted para `_rN` e substituído por `_rN.value.get()` no inicializador (um só `await` por declarador); outros casos → `await-position-unsupported`. `await` em `use*` → `await-in-use-unsupported` (MVP).
2. Tudo depois dele até o próximo `await`/ponto de decisão é continuação: `continuation(_rN, () => { … })`. Awaits seguintes aninham continuações.
3. Leituras de `x` → `_rN.value.get()`. Se `let x = await` → escritas `x = v` → `_rN.value.set(v)`, e `x.campo = v` funciona pelo proxy.
4. `await EXPR` sem declarador → `resource` sem variável (só espera).
5. `const [a, b] = await Promise.all(…)` → um recurso; `a` → `_rN.value.get()[0]`.
6. `pending(x)`/`refresh(x)` → `_rN.pending.get()`/`_rN.refresh()`. `abortSignal()` não é reescrito.
7. `try { await … }` no escopo raiz → `await-in-try` (MVP). `await` dentro de `if` sem `return` → `await-in-branch` (não suportado no MVP).
8. Dois `await` consecutivos cujas expressões não leem variáveis declaradas pelo anterior → dica `await-waterfall`.
9. Early returns misturados com awaits: a ordem do código é respeitada (um `if` depois de um `await` fica dentro da continuação daquele `await`).

A função compilada **não** é `async` (o `async` é removido). O tipo público continua `Promise<JSX.Element>` para o TS.

## 11. Funções `use*`

- Parâmetros: cada parâmetro posicional `p` é recebido como getter. **Defaults em thunk no callee** (D59): sem default → `p = _void`; com default `p = expr` → `p = () => expr`. Desestruturação `({ a, b })` → `p().a`. Rest `(...args)` → array de getters (leitura `args.map(g => g())`). Escrita em parâmetro → erro `use-param-assignment`; `useX(...xs)` → erro `use-spread-args-unsupported`.
- Corpo: §3/§4 completos, incluindo early return (sem JSX: `return` dentro de `if` em `use*` é JS normal e **não** vira branch; só componentes têm fluxo reativo).
- Retorno:
  - objeto literal → por propriedade conforme [17](17-contratos.md#convenções-de-emissão-descobertas-nas-saídas-compiladas);
  - identificador de `stateLiteral` (ex.: `return pos`) → como está (já é proxy);
  - função ou `undefined` → como está;
  - identificador de `let`/memo solto → erro `use-return-not-object`.
- Chamada (em qualquer corpo reativo, inclusive outra `use*`): `useX(a, b)` → `useX(() => a', () => b')`. Chamada fora de corpo reativo: não transformada (o runtime acusa `use-outside-owner` ao criar efeitos).

## 12. Slots

Nos children de um **componente**: percorrer filhos diretos, atravessando fragmentos, `{a && …}`, `{a ? … : …}`. Um `<Slot name="n">` encontrado:

- com filhos JSX → `n: () => <compilado>`;
- com um único filho função → `n: (…args) => <compilado>`;
- dentro de `&&`/ternário → `get n() { return cond' ? (() => …) : undefined }`; se o outro lado do ternário não é `<Slot>`, ele vai para `default` com o getter complementar (`get default() { return cond' ? () => null : () => … }`).

Os filhos restantes formam `default: () => …` (ou `() => null`). Emissão: `children: { [SLOTS]: true, default, n1, n2, … }`. `<Slot>` em qualquer outra posição → `slot-not-direct-child`. `name` não literal → `slot-name-not-literal`. `<Slot>` fora de children de componente → o mesmo erro.

## 13. JSX fora de corpos reativos

Qualquer JSX fora de componente/`use*` (argumento de `mount`, constante de módulo, retorno de função comum) é compilado normalmente e embrulhado em thunk `() => …`. `mount(el, target, opts)` recebe o thunk.

## 14. Módulo

- Imports de `jotastic/runtime` gerados por uso, nomeados.
- Imports de `jotastic` (`watch`, `on`, …) são removidos quando totalmente reescritos; `Boundary`, `Portal`, `createContext`, `useContext`, `tick`, `raw`, `onMount`, `onCleanup`, `untrack`, `mount` continuam importados de `jotastic`.
- Templates hoisted no topo, deduplicados por string.
- Dev: `{ name, loc }` em `signal`/`state`/`memo`/`effect`/`component`/`list`/`resource`/`external`; `data-jo="Arquivo.tsx:linha"` no elemento raiz do template de cada componente.
- Prod: sem metadados; `inspect` removido; `console` não é tocado.
- Prod, otimização opcional (atrás de flag até ser testada): inlinar `memo` cujo valor é lido em exatamente um binding e cujo `fn` não tem chamadas (expressão pura) → o binding lê a expressão diretamente.

## 15. Diagnósticos

Emitidos durante a análise (nunca durante a emissão), com `loc` do nó e `fix` quando mecânico. IDs e níveis em [12](12-diagnosticos.md). Erros impedem a emissão do arquivo; avisos e dicas não.
