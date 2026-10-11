# 10 — Compilador

> Algoritmo completo: [18-transformacoes.md](18-transformacoes.md). Saída do analyzer: [contracts/analyzer.d.ts](contracts/analyzer.d.ts). Este documento é a visão geral.

O compilador recebe TSX válido e emite JS que chama um runtime pequeno ([11](11-runtime.md)). Ele faz a burocracia e verifica o que dá para verificar.

## Pacotes

```
@jotastic/analyzer    AST → classificação de bindings + diagnósticos (função pura, sem I/O)
@jotastic/compiler    analyzer + transformação (plugin Babel no MVP)
@jotastic/vite        integra o compiler, HMR, devtools
@jotastic/eslint-plugin  reusa o analyzer: os mesmos IDs e autofixes aparecem no editor
```

O analyzer é **puramente sintático e de escopo**: não precisa de tipos do TypeScript. Isso o mantém rápido, simples e portável (Babel hoje, oxc depois).

## Pipeline

```
.tsx ─► parse ─► detectar corpos reativos (componentes, use*)
     ─► análise de escopo ─► classificar bindings (estado / derivado / constante / lista / recurso)
     ─► diagnósticos
     ─► transformar JSX em templates + bindings
     ─► reescrever leituras/escritas
     ─► emitir JS + sourcemap (+ metadados em dev)
```

Configuração do usuário:

```jsonc
{ "compilerOptions": { "jsx": "preserve", "jsxImportSource": "jotastic" } }
```

## 1. Corpos reativos

| Forma | Gatilho |
|---|---|
| Componente | Função em PascalCase que retorna JSX em algum caminho (declaração, arrow, `export default`), em `.tsx` |
| Função `use*` | Função no escopo do módulo cujo nome começa com `use`, em `.ts`/`.tsx` |

Só o escopo raiz desses corpos é reativo.

## 2. Classificação

| Declaração | Condição | Vira |
|---|---|---|
| `let x` | lido em contexto vivo (JSX, `watch`, `const` derivado, `use*`) | `signal` |
| `let x` | lido só em handlers/funções | variável comum (otimização invisível) |
| `const x = {…}` / `[…]` | literal sem leituras reativas | `store(literal)` (objeto reativo, referência fixa) |
| `const x = {…}` / `[…]` | literal com leituras reativas | `memo(() => literal)`; getters no literal viram um memo cada |
| `const x = () => …` / `function` | — | constante |
| `const x = <JSX/>` | — | constante (bindings internos vivos) |
| `const x = expr.map(i => JSX)` | `.map` com JSX | `list(...)` |
| `const x = await expr` / `let x = await expr` | corpo raiz | `resource(...)` |
| `const x = useAlgo(args)` | — | chamada com args em getters |
| `const x = expr` | `expr` lê só identificadores não reativos conhecidos (literais, imports de valor, outras constantes) | constante |
| `const x = expr` | qualquer outro caso | `memo(() => expr)` candidato: executa na hora; sem leituras reativas → constante |
| Parâmetro desestruturado | componente ou `use*` | `props.x` (getter) |
| Parâmetro posicional de `use*` | — | `arg()` (getter) |

Leituras viram `x.get()`/`props.x`; escritas viram `x.set(...)`. Vale em **qualquer** lugar do escopo, inclusive closures e handlers (sem stale closures).

## 3. JSX → template + bindings

**Entrada:**

```tsx
export function Counter({ label, start = 0 }: { label: string; start?: number }) {
  let count = start
  const double = count * 2
  watch(() => console.log('count', count))
  return <button class="btn" onClick={() => count++}>{label}: {count} (dobro: {double})</button>
}
```

**Saída (dev, legível de propósito):**

```js
import { signal, memo, effect, template, insert, listen, untrack } from 'jotastic/runtime'

const _t0 = template('<button class="btn"> : <!> (dobro: <!>)</button>')

export function Counter(props) {
  const count = signal(untrack(() => props.start ?? 0))
  const double = memo(() => count.get() * 2)                  // em prod: inlinado, pois é usado em 1 binding
  effect(() => console.log('count', count.get()))

  const _el = _t0()
  const _a = _el.firstChild, _b = _a.nextSibling.nextSibling, _c = _b.nextSibling.nextSibling
  listen(_el, 'click', () => count.set(count.get() + 1))
  insert(_el, () => props.label, _a)
  insert(_el, () => count.get(), _b)
  insert(_el, () => double.get(), _c)
  return _el
}
```

Quando `count` muda: o `insert` de `_b` atualiza um `TextNode`; `double` recalcula e, se mudou, o de `_c`; o de `_a` e `Counter` não rodam.

### Props no pai

```tsx
<Counter label={title} start={10} />
// → Counter({ get label() { return title.get() }, start: 10 })
```

Estático vira valor; dinâmico vira getter. `children` vira getter; no filho, `children` lido mais de uma vez é memoizado (`children(() => props.children)`).

Quando os children de um componente contêm `<Slot name>` diretos, o compilador emite um objeto de slots no lugar do getter único:

```js
Card({ children: { header: () => _t1(), default: () => _t2(), row: (item) => …, get footer() { return admin.get() ? _t3() : undefined } } })
```

`useSlots(children)` no filho é só a tipagem desse objeto.

### Funções `use*`

```ts
export function useFetch(url) { let data = null; watch(() => { fetch(url) ... }); return { data } }
// →
export function useFetch(url) {                 // `url` é um getter
  const data = signal(null)
  watch(() => { fetch(url()) ... })
  return { get data() { return data.get() }, set data(v) { data.set(v) } }
}
// chamada: useFetch(`/api?q=${query}`) → useFetch(() => `/api?q=${query.get()}`)
```

### Condicionais, listas, early return, await

Ver [06](06-controle-de-fluxo.md) e [07](07-async.md). Em resumo: `branches([...])`, `list(parent, source, render, key, marker)`, `resource(fn)` + `asyncBoundary(...)`.

### Formulários

`value`/`checked` em `input`/`textarea`/`select` sem handler, sem `readOnly` e com expressão atribuível → o compilador adiciona `listen(el, 'input'|'change', e => <expr> = coerce(e.currentTarget))`, com a coerção decidida pelo `type` literal (`number`/`range` → `valueAsNumber` ou `null`; `checkbox` → `checked`; `select multiple` → array; demais → string).

### `on` e `external`

Chamadas a `on` importado de `jotastic` recebem o **alvo** embrulhado em getter (`on(() => mql.get(), 'change', fn)`); o runtime re-liga quando o alvo muda. `external` já recebe funções.

### Eventos

`onClick={fn}` → `listen(el, 'click', fn)` (direto). `onClickCapture` → `{ capture: true }`. Handlers são embrulhados em `runWithOwner` para roteamento de erros ao `<Boundary>`.

## 4. Otimizações

| Estratégia | Efeito |
|---|---|
| Templates hoisted por módulo; texto estático adjacente mesclado; `<!>` só em posições dinâmicas | 1 `cloneNode` por instância |
| Não alocar `memo` quando a constância é provável sintaticamente | menos objetos |
| Inlinar derivado puro usado em um único binding | 1 effect em vez de memo + effect |
| `let` só lido em handlers vira variável comum | zero signals |
| Props estáticas = valores; dinâmicas = getters; `children` memoizado; slots separados em build | nada criado duas vezes, zero filtragem |
| `class={{}}` → `classList.toggle` por chave; `style={{}}` → `setProperty` por propriedade | 1 binding por chave |
| Tabela atributo vs propriedade; SVG/MathML | sem `setAttribute` genérico |
| Imports por helper (`list`, `branches`, `resource` em módulos separados) | hello world não paga por async |
| Metadados de dev (`name`, `loc`, hook do devtools) removidos em prod | zero custo |
| Só a continuação de early return/await vira owner | setup sem wrapper |
| `.filter().map()` como uma lista; índice como getter | sem array intermediário; mover não recria |

## 5. Modo dev

Injeta `name` e `loc` em signals, memos, bindings e owners; chamadas ao hook `__JOTASTIC_DEVTOOLS__`; verificação readonly em resultados de derivados e em stores fora de ações. Tudo removido em prod.

## 6. Testes

- **Analyzer**: tabela de classificação (entrada → classe) e catálogo de diagnósticos (um fixture por ID).
- **Snapshot**: `.tsx` → `.js` esperado por regra.
- **Comportamento**: compila, executa em `happy-dom`, verifica o DOM e **quantas vezes** cada binding rodou. É o teste que prova "sem atualização desnecessária".
- Os exemplos compilados à mão no M1 são os primeiros snapshots.
