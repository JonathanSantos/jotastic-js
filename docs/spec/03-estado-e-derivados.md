# 03 — Estado e derivados

## `let` é estado

Todo `let` no escopo raiz de um corpo reativo vira um signal.

```tsx
function Counter() {
  let count = 0
  return <button onClick={() => count++}>{count}</button>
}
```

- Atribuições (`count = 5`, `count++`, `count += 1`, `[a, b] = [b, a]`) disparam a atualização.
- O inicializador é lido **uma vez**. `let x = props.start` copia o valor.
- Atribuir o mesmo valor (`Object.is`) é no-op.
- Um `let` que nunca é lido em contexto vivo (JSX, `watch`, `const` derivado, `use*`) vira uma variável comum, sem custo. Isso cobre `let timer: number | undefined` e outros "refs mutáveis".

## Objetos e arrays: mutação é rastreada pelo objeto

> **Reatribuição é rastreada pelo `let`. Mutação é rastreada pelo objeto.**

Quando um **objeto plain ou array** entra em um lugar reativo (`let`, `const`, prop, item de lista, campo de store, resultado de `await`), ele passa a ser um **objeto reativo** (proxy profundo e lazy). Mutações profundas funcionam:

```tsx
let todos: Todo[] = []
const filters = { text: '', done: false }      // const com objeto literal É estado mutável

todos.push({ text, done: false })             // reativo: só a lista reage
todos[0].done = true                          // reativo: só a classe daquele <li>
filters.text = 'x'                            // reativo
todos = await api.list()                      // reatribuição: troca a referência (sem reconcile)
```

Regras:

| Valor | Tratamento |
|---|---|
| Objeto plain (`{}`), array | Proxy profundo, lazy (criado no primeiro acesso), uma assinatura por propriedade |
| Instância de classe, `Map`, `Set`, `Date`, `RegExp`, elemento DOM, `File`, `Promise` | **Intacto**, comparado por referência. Seus services e models passam pela lib sem serem tocados |
| Valor marcado com `raw(v)` | Intacto (para datasets grandes e imutáveis) |

- **Reatribuir troca a referência.** `user = novoUser` não "mescla" no antigo: o antigo continua existindo para quem o referencia (`let original = user` continua sendo o original). Não há reconcile implícito; é opt-in na fase 2 (`reconcile()`).
- **Identidade estável:** o mesmo objeto raw sempre devolve o mesmo proxy (`todos[0] === todos[0]`), e `includes`/`indexOf`/`Map.has` encontram tanto o raw quanto o proxy.
- `raw(x)` também **desembrulha** um proxy. Use para `structuredClone`, `postMessage`, libs que checam identidade ou `JSON.stringify` de árvores grandes.
- Métodos de array (`push`, `splice`, `sort`, `reverse`...) notificam em batch: uma rodada de atualização por chamada.

## `const` é derivado

Um `const` cujo inicializador lê algo reativo (estado, prop, derivado, store, item de lista) vira um **valor derivado memoizado**.

```tsx
function Cart({ taxRate }: { taxRate: number }) {
  let items: Item[] = []
  const subtotal = items.reduce((s, i) => s + i.price, 0)   // derivado
  const total = subtotal * (1 + taxRate)                    // derivado de derivado + prop
  const fmt = new Intl.NumberFormat(locale)                 // derivado: acompanha `locale`
  const money = fmt.format(total)                           // derivado
}
```

Semântica:

1. **Executa na hora, na ordem do código** (como qualquer `const` em JS), rastreando o que leu.
2. Se não leu nada reativo, vira uma constante: custo zero daqui em diante.
3. Se leu, vira um memo já avaliado. Recalcula **só quando uma dependência mudou e alguém lê** (lazy). Se o resultado for igual (`Object.is`, ou comparação rasa para arrays/objetos plain), quem depende dele não é notificado.
4. O resultado é **somente leitura**. Em dev, mutar o resultado de um derivado avisa `derived-mutated`.
5. **Se tem efeito colateral, não é `const`.** `const chart = new Chart(canvas, data)` seria recriado a cada mudança de `data`: use `external` ([04](04-efeitos-e-ciclo-de-vida.md#external)). Em dev, um derivado que recalcula e devolve uma instância de classe avisa `derived-recreates-instance`.

Classificação completa:

| `const x = …` | Vira |
|---|---|
| Literal de objeto/array **sem** leituras reativas (`{ name: '' }`, `[]`) | Estado mutável (objeto reativo), referência fixa |
| Literal de objeto/array **com** leituras reativas (`{ total: price * qty }`, `[...users].sort()`) | Derivado (somente leitura) |
| Literal com **getters** (`{ get name() { return … } }`) | Um derivado por getter, lazy, no mesmo objeto (igual ao store) |
| Função ou arrow | Função estável |
| JSX | Constante; os bindings internos são vivos |
| `items.map(i => <JSX/>)` | Lista com chave (mesma transformação do JSX) |
| `await …` | Recurso ([07](07-async.md)) |
| `useAlgo(…)` | Resultado de função reativa (objeto com getters) |
| Qualquer outra expressão | Derivado candidato: o runtime decide na primeira execução |

Desestruturar também funciona: `const { count, total } = cart` vira dois derivados.

A regra dos literais segue a regra geral: **`const` que lê estado é derivado**. Para copiar valores reativos em um objeto mutável, use `let` (o inicializador roda uma vez):

```tsx
let form = { ...user }                       // cópia mutável; não acompanha `user`
const errors = {                             // derivado (um memo para o objeto inteiro)
  name: form.name.length < 3 ? 'Mínimo 3' : null,
  email: /@/.test(form.email) ? null : 'Inválido',
}
const errors2 = {                            // opcional: um derivado por propriedade, se o objeto for caro
  get name() { return form.name.length < 3 ? 'Mínimo 3' : null },
}
```

## Funções `use*`

Lógica reutilizável (o equivalente aos custom hooks) é uma **função comum cujo nome começa com `use`**, declarada no escopo do módulo, em `.ts` ou `.tsx`. O compilador aplica a ela as mesmas regras do componente.

```ts
// lib/useFetch.ts
import { watch } from 'jotastic'

export function useFetch<T>(url: string) {
  let data: T | null = null
  let error: Error | null = null
  const loading = data === null && error === null

  watch(() => {
    const ctrl = new AbortController()
    fetch(url, { signal: ctrl.signal })                 // `url` é lido vivo: refaz quando muda
      .then(r => r.json()).then(d => (data = d)).catch(e => (error = e))
    return () => ctrl.abort()
  })

  return { data, error, loading }
}
```

```tsx
// componente
const users = useFetch<User[]>(`/api/users?q=${query}`)   // refaz quando `query` muda
{users.loading ? <Spinner /> : users.data!.map(u => <Row key={u.id} user={u} />)}
users.data = []                                           // escrever de fora também funciona (setter gerado)
```

Regras:

1. **Parâmetros são lazy**, com a mesma regra das props: a chamada embrulha cada argumento em um getter e o corpo lê sempre o valor atual. Um só modelo mental para "entrada de componente" e "entrada de função reativa". Parâmetros com valor padrão e rest funcionam. Consequência: **nunca peça thunks** (`el: () => HTMLElement`); declare `el: HTMLElement | undefined` e o chamador passa o `ref` direto.
2. **Corpo**: `let`, `const`, `watch`, `on`, `external`, `onMount`, `onCleanup`, early return (sem JSX), outras `use*`. Efeitos pertencem ao owner de quem chamou e são descartados com ele.
3. **Retorno**: um objeto literal. O compilador gera um getter (e um setter, para `let`) por chave. Retornar um `let` solto é erro `use-return-not-object`. Retornar uma função ou nada também é válido (ex.: `useInterval(fn, ms)` não retorna).
4. **Sem regras de hooks.** Pode chamar dentro de `if`, loops, handlers... A única exigência é estar, direta ou indiretamente, dentro de um componente (senão, erro em runtime `use-outside-owner`).
5. Chamar uma `use*` de um arquivo **não compilado** (ex.: um `.js` de terceiros) não é suportado.

Exemplos de `use*` que a biblioteca pode oferecer como receitas (não como API): `useMouse`, `useLocalStorage(key, initial)`, `useDebounced(value, ms)`, `useMediaQuery(q)`, `useInterval(fn, ms)`.

## Estado compartilhado

Fora de corpos reativos, `let` é JS normal. Para estado lido por vários componentes use `createStore` ([08](08-store.md)):

```ts
export const cart = createStore((set, get) => ({
  items: [] as Item[],
  get total() { return get().items.reduce((s, i) => s + i.price, 0) },
  add: (item: Item) => set(s => { s.items.push(item) }),
}))
```

```tsx
<span>{cart.items.length} itens — R$ {cart.total}</span>
```

| Situação | Use |
|---|---|
| Só um componente usa (input, aberto/fechado, aba) | `let` |
| Lógica com estado reutilizada entre componentes | função `use*` |
| Lido por componentes distantes (usuário, carrinho, tema) | `createStore` |
| Estado de componente composto (Tabs ↔ Tab) | `createContext` (fase 2) ou store passado por prop |
| Dados de servidor | `await` no componente ([07](07-async.md)) |

## Escapes avançados (`jotastic/runtime`)

`signal`, `computed`, `store`, `effect`, `batch` ficam exportados em `jotastic/runtime` para autores de bibliotecas. Não fazem parte da API do dia a dia e não aparecem no tutorial.
