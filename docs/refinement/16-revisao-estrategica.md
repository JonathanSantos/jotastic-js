# 16 — Revisão estratégica da spec

> Status: **aprovada e aplicada** em [docs/spec](../spec/README.md) · 2026-10-11 · Revisa os documentos 01–15 com as lentes do pedido: *JSX igual ao React, reativo, simples, dev-friendly, DX incrível e otimizado ao extremo; o compilador confere o que dá para conferir e gera a burocracia.*

## 0. Resumo executivo

A base está certa e não deve mudar: componente roda uma vez, atualização por nó, sem VDOM, TSX puro, props como getters, early return e `await` compilados. O que esta revisão muda:

| # | Achado | Gravidade | Decisão proposta |
|---|---|---|---|
| 1 | **Reconcile automático na reatribuição quebra a semântica do JS** (aliasing de objetos) | Bloqueante | D24: reconcile é opt-in; reatribuir troca a referência |
| 2 | **`const items = []` + `items.push()` não atualiza a UI** (armadilha silenciosa) | Bloqueante | D25: mutação é rastreada pelo objeto, reatribuição pelo `let` |
| 3 | **Derivado "lazy" muda a ordem de execução do JS** (um `const` nunca lido nunca roda) | Alta | D26: primeira execução na hora, recálculo lazy |
| 4 | **Lógica reutilizável (custom hooks) não tem história** coerente | Alta | D27: funções `use*` compiladas com as mesmas regras do componente |
| 5 | **Diagnósticos só aparecem no build**, não no editor | Alta (DX) | D28: analisador compartilhado + plugin ESLint |
| 6 | Fila de temas 2–10 sem decisão | Média | §3: uma decisão por tema (D29–D46) |
| 7 | Documentos com contradições entre si | Média | §9: lista para a consolidação em "spec v1" |

As propostas R1–R13 da revisão crítica ficam **aprovadas** com os ajustes da pesquisa (14), exceto onde esta revisão diz o contrário (R2 ganha `on`/`external`/`tick`; R10 cai para o formato "preservar só com inicializador inalterado").

---

## 1. O que está certo e não mexemos

| Decisão | Por que fica |
|---|---|
| Componente = construtor; atualização por nó | Tese central, validada por Solid/Svelte 5/Vapor |
| TSX válido, zero sintaxe nova | `tsc`, ESLint, editor e IA funcionam de fábrica; é o diferencial contra `.svelte`/`.vue` |
| `let` = estado, `const` = derivado, `watch` explícito | Cabe na regra de ouro; o Svelte 5 provou que "parece JS" é o que o dev quer |
| Props como getters + destructuring reescrito | Resolve a dor nº 1 do Solid sem API |
| `.map` e `? :` compilados (sem `<For>`/`<Show>`) | Mantém o JSX do React |
| Early return reativo e `await` no componente | Os dois "uau" de DX; ninguém faz |
| Store estilo Zustand, sem seletores, readonly fora das ações (R7) | Solid 2.0 chegou ao mesmo desenho |
| Sem proxy em instâncias de classe (R8) | Princípio funcional; evita o bug de `#private` |
| Devtools embutido "por que isso mudou?" | Diferencial real contra o ruído do React DevTools |

---

## 2. Problemas que exigem mudança de decisão

### 2.1 Reconcile automático quebra o JS (D24)

A spec (04 §Camada 2, README decisão 6) diz que `user = novoUser` **não troca a referência**: percorre o valor novo e aplica as diferenças no proxy antigo. Isso só é seguro quando o objeto antigo pertence exclusivamente àquela variável, e o runtime não tem como saber isso. Três casos comuns quebram:

```tsx
// 1. Seleção apontando para um item da lista
let selected = todos[0]
selected = todos[1]        // reconcile copiaria os campos de todos[1] DENTRO de todos[0]

// 2. Guardar o original para detectar alterações (form "dirty")
let original = user
user = edited              // reconcile muta `original` também; dirty-check nunca acusa mudança

// 3. Dentro de um store
set(s => { s.current = s.items[1] })   // o valor antigo de `current` era s.items[0]: reconcile mutaria items[0]
```

Tentativas de salvar a ideia (reconciliar só quando o valor novo é "raw", ou só quando o proxy é "owned" pela variável) continuam quebrando o caso 2, porque o problema é o **antigo** ser referenciado em outro lugar, e isso é invisível ao runtime. O Solid, por esse motivo, deixa `reconcile` explícito.

**O que perdemos ao remover:** "atribuir um objeto profundamente igual resulta em 0 effects". **O que já cobre isso sem reconcile:**

| Guard | Onde | Custo quando o objeto é igual |
|---|---|---|
| `Object.is` em folhas | signal/proxy | 0 |
| `if (node.data !== v)` | bindings de texto/atributo | re-executa o binding, não escreve no DOM |
| `computed(() => !!user)` | condicionais | 0 (mesmo lado) |
| Lista com `key` | `list()` | nós reaproveitados, só os bindings do item re-leem |
| Comparação rasa | resultado de derivados (Camada 3, mantida) | 0 |

O cenário que fica caro é **lista sem `key` cuja fonte foi substituída** (reference keys → recria tudo). Isso é tratado pelo diagnóstico `prefer-key-in-list` de precisão alta (D46).

**D24 (proposta):** reatribuir um `let`, um campo de store ou um resource **troca a referência** (o valor novo, se for POJO/array, vira proxy lazy). Reconcile vira **opt-in pós-MVP** (`set(reconcile(data))` ou helper `reconcile(a, b)` em `jotastic/runtime`), para quem quer identidade estável em dados de servidor. Atualizar README (decisão 6), 02, 04 e 10.

### 2.2 `const` com objeto mutado é armadilha silenciosa (D25)

Pela tabela atual, `const items: Item[] = []` não lê nada reativo → constante → `items.push(x)` num handler não atualiza a UI. O TS não acusa, o compilador não acusa, o dev descobre em produção. E `eslint prefer-const` empurra o dev exatamente para esse erro quando ele escreve `let todos = []` e só muta.

A regra honesta, que é 1:1 com o JS:

> **Reatribuição é rastreada pelo `let`. Mutação é rastreada pelo objeto.**

- `let x = v` → signal (reatribuível). Se `v` é POJO/array, é proxy (mutações rastreadas).
- `const x = {…}` / `[…]` → referência constante, **proxy** (mutações rastreadas). Não é derivado.
- `const x = expr` que lê estado → derivado (D26). O resultado é **somente leitura**: em dev, o runtime devolve um proxy readonly que avisa `derived-mutated` com arquivo e linha. Em prod, sem custo.
- Props, itens de lista, valores de store e resultados de `await` seguem a mesma regra: POJO/array vira proxy ao entrar; classes, `Map`, `Set`, `Date`, DOM passam intactos (R8).

Com isso o slogan continua simples ("`let` = estado, `const` = derivado") e deixa de ter uma exceção perigosa: um objeto literal em `const` é estado que não muda de referência, exatamente como em JS.

### 2.3 Derivado "lazy" muda a ordem do JS (D26)

15 §1.3 define derivados como "lazy e memoizados" e "derivado candidato: na primeira execução o runtime vê se algo foi lido". Se a primeira execução só acontece na primeira **leitura**, um `const` que ninguém lê nunca roda, e um `const` lido só num handler roda no clique. Isso quebra "o corpo roda uma vez, de cima para baixo" e surpreende em `const id = register(x)`.

**D26 (proposta):** todo `const` candidato **executa na hora, na ordem do código** (como JS), rastreando o que leu. Sem leituras reativas → vira constante (custo zero depois). Com leituras → vira memo já avaliado; recálculos posteriores são lazy (só quando sujo **e** lido). É o modelo do `createMemo` do Solid. Fica mantido: `const` com efeito colateral que lê estado **vai re-executar**; a regra documentada é "se tem efeito colateral, não é `const`: use `external` ou `watch`", com o aviso de dev já previsto (resultado é instância de classe).

Otimizações do compilador que decorrem daqui (ver §6): não alocar `computed` quando a constância é provável sintaticamente, e **inlinar** derivados puros usados em um único binding.

### 2.4 Lógica reutilizável sem história coerente (D27)

Hoje 02 mostra `useMouse` usando `store()` + `onMount` + `addEventListener`, 15 introduz `on()`, e 04 diz que `signal`/`store` ficam em `jotastic/runtime` (interno). Fora do componente `let` "não é mágico", então a única forma de escrever lógica reutilizável é com primitivas que não queremos expor. Isso contradiz "o compilador trabalha, o dev não".

**D27 (proposta): funções `use*` são compiladas com as regras do componente.**

```tsx
// lib/useFetch.ts  (arquivo .ts comum)
export function useFetch<T>(url: string) {         // parâmetros são lazy, como props
  let data: T | null = null
  let error: Error | null = null
  const loading = data === null && error === null  // derivado

  watch(() => {
    const ctrl = new AbortController()
    fetch(url, { signal: ctrl.signal })            // `url` é lido vivo: refaz quando muda
      .then(r => r.json()).then(d => (data = d)).catch(e => (error = e))
    return () => ctrl.abort()
  })

  return { data, error, loading }                  // vira { get data(){…}, set data(v){…}, … }
}

// componente
const users = useFetch<User[]>(`/api/users?q=${query}`)   // chamada compila para useFetch(() => `…${query}`)
{users.loading ? <Spinner /> : users.data!.map(…)}
```

Regras:
1. Gatilho sintático: função declarada no escopo do módulo cujo nome começa com `use` (convenção do React, que o público já conhece). Vale em `.ts` e `.tsx`.
2. **Parâmetros são lazy**, com a mesma regra das props: a chamada embrulha cada argumento em getter e o corpo lê o valor atual. Um só modelo mental para "entrada de componente" e "entrada de função reativa".
3. Corpo: `let`/`const`/`watch`/`on`/`external`/early return (sem JSX) com as regras do componente. Efeitos pertencem ao owner de quem chamou.
4. Retorno: objeto literal → o compilador gera getters/setters por chave. Retornar um `let` solto é erro `use-return-not-object` ("retorne um objeto para manter a reatividade").
5. Sem regras de hooks: pode chamar dentro de `if`, loop, etc. Chamar fora de um owner (fora de componente/`use*`) é erro em runtime com mensagem acionável.
6. `signal`/`computed`/`store` continuam exportados de `jotastic/runtime` para autores de libs (escape, não API do dia a dia).

Com D27, `store()` sai da API pública do dia a dia, 02 §"Lógica reutilizável" é reescrito e o modelo mental ganha uma frase só: *"componentes e funções `use*` têm corpo reativo; o resto é JS"*.

### 2.5 Diagnósticos no editor, não só no build (D28)

"O compilador confere o que dá para conferir" só vale se o dev vê o aviso **enquanto digita**. O plugin Vite roda no build/dev server; o editor não enxerga.

**D28 (proposta):** separar o pacote `@jotastic/analyzer` (função pura: AST → classificação de bindings + lista de diagnósticos com `fix`). Consumidores:
- `@jotastic/compiler` (transformação, usa a classificação);
- `eslint-plugin-jotastic` (M6): mesmas regras, mesmos IDs, com **autofix** (`className`→`class`, "envolver em `watch`", "adicionar `key`"). ESLint já está em todo editor e em CI.
- Futuro: LSP/TS plugin só se o ESLint não bastar.

Isso também é o que torna a lib boa para agentes de IA (I9): regras com ID, mensagem e correção mecânica.

---

## 3. Decisões propostas para a fila de temas (06)

| Tema | Decisão | Justificativa curta |
|---|---|---|
| **2. Props e two-way** | **D32** `bind:x` em componente = `x` + `onXChange`; o TS exige que o filho declare `onXChange` (mapped type em `LibraryManagedAttributes`). Sem API de opt-in. **D33** derivado gravável (D18): sem API nova; padrões `watch(() => (draft = value))` ou `key={id}`. Prop passada por valor a função externa: coberta por D27 (lazy) e pelo aviso de instrução solta (15 §1.6) | O `onXChange` já é o opt-in que o Svelte queria, só que verificado pelo TS |
| **3. Objetos e classes** | **D25** + R8. `raw(x)` faz as duas coisas: marca um valor para não ser proxiado e **desembrulha** um proxy (necessário para `structuredClone`, `postMessage`, libs que checam identidade). Métodos de busca (`includes`, `indexOf`, `Map.has`...) comparam também contra o raw, como o Vue | Sem isso `todos.includes(item)` com `item` raw devolve `false` |
| **4. Condicionais e `hidden`** | **D34** `hidden` é só um atributo: efeitos continuam, sem `onHide`/`onShow`. Quem precisa pausar usa `keep:alive` (pós-MVP) | Não inventar semântica para um atributo nativo |
| **5. Eventos** | **D29** listeners **diretos por padrão**, nomes camelCase do React (`onClick`), **semântica nativa** (`onChange` = `change` do DOM). Delegação só se o benchmark do M3 mostrar ≥10% em "create 10k rows", e aí **local ao container da lista**, nunca no `document`. Diagnóstico `on-change-on-input` quando `onChange` + `value=` em `input`/`textarea` sugere `onInput`/`bind:` | Zero surpresa (bugs reais no Solid e Svelte); a diferença de perf é mensurável, não presumível |
| **6. Store** | **D37** R7 aprovado. Ações async: o trecho síncrono é um batch; depois de cada `await`, cada `set` é seu próprio batch (sem `runInAction`). `persist` pós-MVP, já desenhado com `version`/`migrate`/allowlist | Mesmo desenho do Solid 2.0 |
| **7. Async** | **D36** R4 aprovado. D22: **sem garantia de consistência** no MVP (`id` novo aparece na hora, `user` antigo fica até chegar; `pending(user)` para dimmed); transições depois. D21: `try/catch` em volta de `await` **pós-M7** (o `resource` nasce com estado de erro roteável). Aviso `await-waterfall` nível info. `let x = await …` permite sobrescrita local (optimistic update) até o próximo refetch | Simples primeiro; o desenho não bloqueia |
| **8. Bootstrap e API** | **D38** R3: `mount(el, alvo, { plugins, onError })`. **D39** API do MVP (R2 ajustada) em §3.1 | Uma função, um objeto |
| **9. Erros** | **D35** `<Catch>` captura setup, bindings, `await`, **handlers (inclusive async) e efeitos**: o compilador embrulha handlers em `runWithOwner` e trata a promise rejeitada | Possível graças ao owner; React/Svelte não fazem |
| **10. Tooling** | **D40** tamanho: ≤ Solid no js-framework-benchmark (~5 KB brotli), imports por helper. **D41** HMR no M6: remonta preservando stores de módulo; preservação de `let` por nome **só com inicializador inalterado** (hash), atrás de flag, com log do que foi preservado/resetado. **D42** R12: overlay de flash logo após o M3 | Lição do Svelte sobre `@hmr:keep` |

### 3.1 Superfície de API do MVP (D39)

| Núcleo (`jotastic`) | JSX | Adiado |
|---|---|---|
| `mount` | `bind:value` / `bind:checked` (com coerção: `type=number` → number, `select multiple` → array) | `expose`, `ref` em componente |
| `watch`, `on`, `external` | `ref={el}` | `use:` diretivas |
| `onMount`, `onCleanup` | `key` | `batch` público |
| `untrack`, `tick`, `raw` | `class`/`style` objeto | `keep:alive`, `transition:` |
| `pending`, `refresh`, `abortSignal` | `innerHTML` | `cached`, `invalidate` |
| `<Catch>`, `<Async>` | `hidden` (nativo) | `createContext`, `<Portal>` |
| `jotastic/store`: `createStore` | | `$subscribe`, `$snapshot`, `persist` |

Dezesseis funções/componentes. `<Portal>` e `createContext` são pequenos e provavelmente entram logo depois do M5 (modais e componentes compostos pedem). O owner nasce com um slot `context` desde o M1 para isso não exigir refatoração (D45).

---

## 4. Contrato "o compilador faz a burocracia"

Esta tabela deve abrir o README: é o argumento de venda e a lista de testes de aceitação.

| No React o dev escreve | No Jotastic o dev escreve | Quem faz o trabalho |
|---|---|---|
| `useState` | `let x = 0` | compilador → signal |
| `useMemo` + deps | `const y = x * 2` | compilador → memo com deps rastreadas |
| `useCallback` | função normal | nada a fazer: o corpo roda uma vez |
| `useRef` (DOM) | `let el!: HTMLElement` + `ref={el}` | compilador |
| `useRef` (valor mutável) | `let x` (sem ler no JSX) | compilador: vira variável comum |
| `useEffect` + deps + cleanup | `watch(() => { …; return cleanup })` | runtime rastreia deps |
| `useEffect` para `addEventListener` | `on(window, 'resize', fn)` | runtime remove no unmount |
| `useEffect` para Chart.js/Leaflet | `external(create, update)` | runtime cria após montar, destrói no unmount |
| `memo()` | nada | granularidade por nó |
| `key` obrigatória | `key` opcional + diagnóstico quando importa | compilador |
| `forwardRef` + `useImperativeHandle` | `expose({…})` (pós-MVP) | compilador |
| `useSyncExternalStore` / Zustand seletores | `cart.total` | proxy rastreia por propriedade |
| `useEffect` + `loading` + `error` + flag de cancelamento | `const user = await api.getUser(id)` | compilador → resource com cancelamento e SWR |
| `<Suspense>` + `ErrorBoundary` | `pending=`/`error=` ou `<Async>` | runtime |
| Error boundary que não pega handler | `<Catch>` pega tudo | owner |
| `value` + `onChange` controlados | `bind:value={x}` | compilador |
| `className`, `htmlFor` | `class`, `for` (com autofix) | analyzer |
| `children` renderizado duas vezes cria nós duas vezes | `{children}` | compilador memoiza children por instância |
| `{...props}` perde reatividade (Solid) | `{...rest}` | compilador gera spread com getters |
| Custom hook com regras de hooks | função `use*` normal, pode estar em `if` | compilador (D27) |
| Stale closure | handler lê o valor atual | compilador reescreve leituras |
| Race condition em fetch | automática: resposta antiga ignorada, `abortSignal()` | runtime |
| `flushSync` | `await tick()` | runtime |

---

## 5. Contrato "o compilador verifica"

Catálogo único de diagnósticos (IDs estáveis, usados pelo compilador, pelo ESLint e pelo devtools). Nível: **E** erro, **W** aviso, **H** dica (só no editor).

| ID | Nível | Gatilho (sintático, sem tipos) | Fix |
|---|---|---|---|
| `return-in-loop-or-try` | E | `return` dentro de `for`/`while`/`try` no corpo raiz | sugere ternário / `<Catch>` |
| `await-in-try` | E | `await` dentro de `try` no corpo raiz (até D36 entrar) | sugere prop `error` |
| `use-return-not-object` | E | função `use*` retorna algo que não é objeto literal | — |
| `ref-before-mount` | E | variável de `ref` lida no corpo raiz fora de `onMount`/`external`/handler | sugere `external` |
| `abort-signal-outside-await` | E | `abortSignal()` fora da expressão de um `await` de componente | — |
| `continuation-state-resets` | W | `let` declarado depois de um early return | explica; sugere mover para cima |
| `state-read-in-setup` | W | instrução solta no corpo raiz que lê estado/prop (`console.log(count)`) | autofix: envolver em `watch` |
| `watch-without-reads` | W | `watch` cujo corpo não lê nada reativo | sugere `onMount` |
| `prefer-key-in-list` | W | `.map` com JSX cuja fonte é **reatribuível** (`let` reatribuído em algum lugar, store ou resource) e sem `key` | sugere `key={item.id}` |
| `class-name-alias` | W | `className`/`htmlFor` | autofix → `class`/`for` |
| `on-change-on-input` | H | `onChange` + `value=` em `input`/`textarea` | sugere `onInput` ou `bind:value` |
| `await-waterfall` | H | dois `await` seguidos no corpo raiz sem dependência léxica | sugere `Promise.all` |
| `ref-non-optional-in-branch` | W | `ref` em elemento condicional com variável `!:` | sugere `\| undefined` |
| `derived-mutated` | W (runtime dev) | escrita em resultado de derivado | aponta a linha do `const` |
| `derived-recreates-instance` | W (runtime dev) | derivado recalcula e devolve instância de classe | sugere `external` com `update` |
| `effect-loop` | E (runtime) | efeito escreve no que lê, 100 vezes | nome da variável + linha |
| `use-outside-owner` | E (runtime) | `use*`/`watch`/`on` chamados fora de componente | — |
| `list-recreated` | H (devtools) | `list` descartou e recriou todos os itens num flush | sugere `key` |

Regra de ouro para novos diagnósticos: só entram se forem **sintáticos** (sem tipos) ou de **runtime em dev** com custo zero em prod.

---

## 6. Estratégias de otimização

O objetivo "otimizado ao extremo" se traduz em decisões concretas de compilador e runtime. Cada item é um teste de contrato.

### Compilador

| Estratégia | Efeito |
|---|---|
| **Hoisting de templates** por módulo; texto estático adjacente mesclado; `<!>` só em posições dinâmicas | 1 `cloneNode` por instância, zero `createElement` |
| **Não alocar `computed`** quando a constância é provável (literal, arrow, JSX, expressão só com identificadores não reativos) | menos objetos por instância |
| **Inlinar derivado puro usado em um único binding** (`const double = count*2` lido só num `{double}`) | 1 effect em vez de memo + effect |
| **`let` nunca lido em contexto vivo** (só em handlers) vira variável comum | zero signals para `let timer` |
| **Props estáticas viram valores, dinâmicas viram getters**; `children` lido mais de uma vez é memoizado no filho | nada é criado duas vezes |
| **`class={{a, b}}` → `classList.toggle` por chave; `style={{…}}` → `style.setProperty` por propriedade** | 1 binding por chave, não por objeto |
| **Tabela atributo vs propriedade** (`value`, `checked`, `disabled`, `innerHTML`, `data-*`, `aria-*`, SVG/`xlink`) | escreve no lugar certo, sem `setAttribute` genérico |
| **Imports por helper** (`list`, `branches`, `resource` em módulos separados) | hello world não paga por async |
| **Metadados de dev removidos em prod** (`name`, `loc`, hook do devtools) | zero custo em prod |
| **Early return/await: só a continuação vira owner** | setup não é embrulhado |
| `.filter(...).map(...)` tratado como uma lista com uma fonte | sem array intermediário reativo |
| `(item, i) => …`: `i` vira getter | mover itens não recria nós |

### Runtime

| Estratégia | Efeito |
|---|---|
| **Sinal estrutural por array** (`length`/ordem) + sinal por propriedade de item | `list()` tem 1 assinatura, não 10k |
| **Proxy lazy** criado no primeiro acesso, com cache `WeakMap` raw → proxy | identidade estável, zero custo para subárvores não lidas |
| **Scheduler**: `Object.is` no `set`; DIRTY/CHECK; microtask; **ordem de cima para baixo** (owner pai antes do filho) | glitch-free; invariante do narrowing do early return |
| **Guards de escrita no DOM** (`node.data !== v`, `el.value !== v`) | sem reflow inútil; sem pular o caret em inputs |
| **`list()` com prefixo/sufixo + LIS** (pós-MVP: LIS) | mínimo de `insertBefore` |
| **Handlers são funções estáveis** referenciadas direto no nó (sem wrapper por render) | memória previsível |
| **Fragmentos = arrays de nós** (sem wrapper no DOM) | zero elementos fantasmas |
| Templates como string HTML com marcadores | compatível com hydration futura (I8) sem reescrita |

### Como medimos

- `js-framework-benchmark` desde o **M3** (não M8), rodado em CI com limiar: ≤ Solid + 10%.
- Teste "contagem de execuções": cada exemplo oficial declara quantos bindings rodam por interação. Esse teste é o que prova a tese.
- Tamanho por cenário (D40) medido no CI com `brotli`.

---

## 7. Detalhes de runtime que a spec ainda não define

Itens pequenos, mas que viram bug se ficarem implícitos:

1. **`{0 && <X/>}` renderiza `0`**, como no React. Documentar; sem diagnóstico (precisa de tipos).
2. **`bind:value` em `type=number`, `checkbox`, `radio` (grupo), `select` e `select multiple`**: tabela de coerção (D39).
3. **Proxy e `structuredClone`/`postMessage`/`JSON.stringify`**: `raw(x)` desembrulha; `$snapshot` no store.
4. **`includes`/`indexOf`/`Map.has` com valores raw vs proxy**: instrumentar como o Vue.
5. **`external` e a lista de métodos de destruição automática**: `close` e `abort` só para tipos conhecidos (`WebSocket`, `EventSource`, `AbortController`, `Worker`, `MessagePort`); para o resto, `Symbol.dispose` → `destroy` → `dispose` → `disconnect` → `unsubscribe`. Evita chamar um `close()` que "fecha um painel".
6. **`if (cond) { prepara(); return <X/> }`**: as instruções dentro do bloco rodam a cada ativação do branch, dentro do owner do branch. Definir e testar.
7. **Componente que retorna array/fragment em posição condicional**: `insert` com marcadores de início e fim.
8. **SVG/MathML** no `template()`: flag de namespace detectada pelo compilador.
9. **`autofocus`** em elemento recém-inserido: runtime chama `.focus()` (R11).
10. **Equality em `set` de store com `Object.is` para primitivos e troca de referência para objetos** (D24).

---

## 8. Estratégia de execução

1. **Runtime primeiro, compilador depois.** Escrever à mão a saída compilada do Counter, do TodoMVC e da tela com `await` contra o runtime, antes de existir compilador. Esses arquivos viram os **snapshots** do compilador. Reduz o risco de a API do runtime não servir ao compilador.
2. **Motor reativo: avaliar `alien-signals`** (2,9 KB, usado pelo Vue 3.6) por trás de uma fachada própria no M1 (D43). Critério: velocidade no benchmark e capacidade de emitir os eventos do devtools. Se não servir, implementação própria com a mesma fachada.
3. **Analyzer como pacote puro** desde o M2 (D28). Testes do analyzer = tabela de classificação + catálogo de diagnósticos.
4. **Fatia vertical na primeira semana**: `npm create` → Vite → Counter compilado → overlay de flash. Valida integração antes de profundidade.
5. **Benchmark e tamanho no CI desde o M3.**
6. **`@jotastic/test`** mínimo (`render`, `tick`, contador de execuções) logo após o M3, usado pelos nossos próprios exemplos e exposto ao dev.
7. **Exemplos oficiais são a spec viva**: cada feature tem um par "React antes / Jotastic depois" em `examples/`, com o teste de contagem de execuções.
8. **Consolidar os documentos em "spec v1"** depois desta aprovação (§9): um documento normativo por área (modelo mental, API, compilador, runtime, diagnósticos) e os documentos 13/14/16 viram apêndices históricos.

Marcos revisados: M1 inclui owner com `context`; M3 inclui benchmark + overlay (R12); M5 inclui `<Portal>` e `createContext` se o tempo permitir; M6 inclui ESLint plugin e HMR por D41; M7 inclui `try/catch` só se o `resource` já o permitir sem redesenho.

---

## 9. Inconsistências entre documentos (para a consolidação)

| Onde | Problema | Fonte da verdade |
|---|---|---|
| README decisão 6, 02 §Objetos, 04 §Camada 2, 10 §set | Reconcile automático | **D24** |
| 03 §2 tabela | Linhas desatualizadas (`new` nunca derivado foi descartado em 15; linha de "parâmetro desestruturado" ficou fora da tabela) | 15 §1.3 + D26 |
| 04 §API pública, 05 Runtime, 08 §1, 12 | `createApp` | **R3/D38** |
| 05 §Entra no MVP | `expose`, `$subscribe`, `$snapshot`, `persist`, `createApp` | **R2/D39** |
| 02 §Lógica reutilizável | `store()` público + `onMount`/`addEventListener` | **D27** + 15 (`on`) |
| 04 topo, 05 critérios | "< 5 KB gzip" | **R9/D40** |
| 11 §7 | `try/catch` "não suportado" sem prazo | **D36** |
| 13 R5 | "`new` nunca vira derivado" | 15 §1.3 (substituído) |
| 06 "Fila de discussão" | Temas 2–10 sem decisão | **§3** |
| 02 §O que o dev não pode fazer | "`let` lido em `setTimeout`... aviso em modo estrito" | não existe "modo estrito"; remover ou virar `state-read-in-setup` |
| 03 §9 | "Babel/TS" no pipeline | Babel no MVP, com analyzer separado (D28) |

---

## 10. Modelo mental final (uma página)

> **O corpo de um componente (ou de uma função `use*`) roda uma vez, de cima para baixo, como JS.**
> **O que está no JSX, em `watch` ou em um `const` que lê estado é vivo.**
> **Reatribuir um `let` ou mutar um objeto é o que dispara a atualização.**

| Você escreve | O que é | Quando atualiza |
|---|---|---|
| `let x = 0` | estado | ao reatribuir (`x = 1`, `x++`) |
| `let user = {…}` / `const list = []` | estado (proxy) | ao mutar (`user.name = …`, `list.push(…)`) e, no `let`, ao reatribuir |
| `const y = x * 2` | derivado (somente leitura) | quando `x` muda e alguém lê `y` |
| `const fn = () => …` / `function fn() {}` | função estável | nunca |
| `const user = await api.get(id)` | recurso | quando `id` muda (cancela o anterior; mantém o conteúdo antigo) |
| `watch(() => …)` | efeito | quando algo lido muda; cleanup antes de rodar de novo |
| `on(alvo, ev, fn)` | listener | removido no unmount |
| `external(create, update?)` | objeto com ciclo de vida | `update` quando algo lido muda; destruído no unmount |
| `{a ? <X/> : <Y/>}` / `if (a) return <X/>` | branch | só quando `a` muda de lado |
| `{items.map(i => <Row key={i.id} />)}` | lista com chave | move/insere/remove nós; itens mantêm estado |
| `({ user })` nas props | leitura lazy | só o binding que lê `user` reage |

Tudo o que não está nessa tabela é JavaScript comum.
