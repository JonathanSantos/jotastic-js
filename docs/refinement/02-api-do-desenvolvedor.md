# 02 — API do desenvolvedor

Este documento descreve **o que o dev escreve**. Como isso é compilado está em [03-compilador](03-compilador.md).

## Componentes

Um componente é uma função com nome em **PascalCase** que retorna JSX, declarada em um arquivo `.tsx`.

```tsx
export function Hello({ name }: { name: string }) {
  return <h1>Olá, {name}!</h1>
}
```

Montagem da aplicação:

```tsx
import { mount } from 'jotastic'
import { App } from './App'

mount(<App />, document.getElementById('app')!)
```

## Estado: `let`

Toda variável `let` declarada **no corpo do componente** vira estado reativo.

```tsx
function Counter() {
  let count = 0
  return <button onClick={() => count++}>{count}</button>
}
```

- Atribuições (`count = 5`, `count++`, `count += 1`) disparam a atualização.
- O valor inicial é lido uma única vez. `let x = props.start` copia o valor inicial e **não** acompanha mudanças posteriores de `props.start` (igual ao `useState(props.start)`).

### Objetos e arrays

Mutações profundas funcionam:

```tsx
function Todos() {
  let todos: Todo[] = []

  function add(text: string) {
    todos.push({ text, done: false })   // reativo
  }

  function toggle(todo: Todo) {
    todo.done = !todo.done              // reativo, atualiza só aquele item
  }
  // ...
}
```

> Decidido: proxy profundo e lazy. Atribuir um objeto novo com os mesmos valores **não** dispara atualização (reconcile, ver [04-runtime](04-runtime.md#proteção-por-valor-em-objetos-igualdade-profunda-otimizada)).

## Derivados: `const`

Um `const` cujo inicializador lê estado ou props vira um **valor derivado memoizado**.

```tsx
function Cart({ taxRate }: { taxRate: number }) {
  let items: Item[] = []
  const subtotal = items.reduce((s, i) => s + i.price, 0)   // derivado
  const total = subtotal * (1 + taxRate)                    // derivado de derivado + prop
  // ...
}
```

- Só é recalculado quando algo que ele lê muda, e só se alguém estiver lendo.
- Se o resultado for igual ao anterior (`Object.is`), quem depende dele **não** é notificado. Esse é o principal guard contra atualizações desnecessárias.
- `const` com funções (`const onSave = () => ...`) **não** vira derivado: funções são estáveis por natureza, já que o componente roda uma vez. Não existe `useCallback`.

## Efeitos: `watch`

```tsx
import { watch } from 'jotastic'

function Search() {
  let query = ''

  watch(() => {
    const ctrl = new AbortController()
    fetch(`/api?q=${query}`, { signal: ctrl.signal })
    return () => ctrl.abort()          // cleanup opcional, roda antes da próxima execução e no unmount
  })

  return <input bind:value={query} />
}
```

- **Sem array de dependências.** As dependências são rastreadas automaticamente pelo que o efeito lê.
- Roda após o componente ser montado no DOM.
- É descartado automaticamente quando o componente é desmontado.

## Libs externas e listeners: `external` e `on`

```tsx
import { external, on } from 'jotastic'

function Sales({ data }: { data: number[] }) {
  let canvas!: HTMLCanvasElement

  const chart = external(
    () => new Chart(canvas, { type: 'bar', data }),     // cria após montar
    (chart) => { chart.data = data; chart.update() },   // atualiza quando `data` muda (não recria)
  )                                                     // chart.destroy() automático no unmount

  on(window, 'resize', () => chart.resize())            // removido automaticamente

  return <canvas ref={canvas} />
}
```

Regras completas em [15-tema-01-modelo-mental](15-tema-01-modelo-mental.md).

## Ciclo de vida

`onMount(fn)` para algo pontual após montar (focus, medir) e `onCleanup(fn)` para cleanup manual. Os dois são raros: `external` e `on` cobrem a maioria dos casos.

## Refs: `ref={variavel}`

Sem `useRef`. O compilador atribui o elemento à variável:

```tsx
let input!: HTMLInputElement
<input ref={input} />
```

## Two-way binding: `bind:`

```tsx
let name = ''
let accepted = false

<input bind:value={name} />
<input type="checkbox" bind:checked={accepted} />
```

`bind:` é JSX com namespace, suportado pelo TypeScript. Açúcar para `value={name} onInput={e => name = e.currentTarget.value}`.

## Props

```tsx
function Avatar({ user, size = 32 }: { user: User; size?: number }) {
  return <img src={user.avatarUrl} width={size} />
}
```

- **Destructuring é seguro.** O compilador reescreve `user` para `props.user` (um getter), então a reatividade não se perde (diferente do Solid).
- Valores padrão funcionam normalmente.
- Um filho só reage à mudança de uma prop **se a lê**, e só no binding exato que a lê. Se `Avatar` não usar `size` dinamicamente, mudar `size` no pai não custa nada.

### Children

```tsx
function Card({ title, children }: { title: string; children: JSX.Element }) {
  return (
    <section class="card">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
```

## Renderização condicional

JSX normal, sem `<Show>`:

```tsx
{loggedIn ? <Dashboard /> : <Login />}
{error && <p class="error">{error}</p>}
```

O compilador garante que o branch só é recriado quando a **condição muda de lado**, não a cada mudança de `error`.

## Listas

`.map` normal, sem `<For>`:

```tsx
<ul>
  {todos.map(todo => (
    <li key={todo.id} class={{ done: todo.done }}>
      {todo.text}
    </li>
  ))}
</ul>
```

- O compilador converte `.map` em uma lista com chave que reaproveita nós existentes.
- `key` é opcional. Sem ela, a chave é a referência do objeto.
- Mudar `todo.done` atualiza **apenas** a classe daquele `<li>`, sem tocar na lista.

## Atributos, classes e estilos

```tsx
<div
  class={{ active: isActive, disabled }}       // objeto, string ou array
  style={{ color, 'font-size': `${size}px` }}  // objeto ou string
  data-id={id}
  aria-label="Fechar"
/>
```

## Eventos

```tsx
<button onClick={() => count++}>+</button>
<form onSubmit={e => { e.preventDefault(); save() }}>
```

Eventos comuns usam **delegação** no root (um listener por tipo de evento para a app inteira).

## Estado compartilhado (entre componentes)

Fora de componentes, `let` não é mágico (é JS normal). Para estado global usamos um **mini Zustand reativo**, sem seletores:

```ts
// stores/cart.ts
import { createStore } from 'jotastic/store'

export const cart = createStore((set, get) => ({
  items: [] as Item[],
  get total() { return get().items.reduce((s, i) => s + i.price, 0) },
  add: (item: Item) => set(s => { s.items.push(item) }),
}))
```

```tsx
// CartBadge.tsx
import { cart } from '../stores/cart'

export function CartBadge() {
  return <span>{cart.items.length} itens — R$ {cart.total}</span>
}
```

> Detalhes em [10-store](10-store.md). Bootstrap e padrões de componentes em [08-bootstrap-e-componentes](08-bootstrap-e-componentes.md).

## Dados assíncronos

```tsx
async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)    // refaz quando `id` muda, cancela a anterior
  return <h1>{user.name}</h1>
}
```

> Detalhes em [11-async-no-componente](11-async-no-componente.md).

## Lógica reutilizável (o equivalente aos custom hooks)

Funções normais que usam `store()`/`watch()` (`store()` é a primitiva de proxy profundo do runtime; `createStore` é construído sobre ela):

```ts
export function useMouse() {   // o nome é livre, `use` é só convenção
  const pos = store({ x: 0, y: 0 })
  const move = (e: MouseEvent) => { pos.x = e.clientX; pos.y = e.clientY }
  onMount(() => window.addEventListener('mousemove', move))
  onCleanup(() => window.removeEventListener('mousemove', move))
  return pos
}
```

Como roda dentro do setup (uma vez), não há regras de hooks: pode chamar dentro de `if`, de loops etc.

## Early return funciona

```tsx
if (!user) return <Spinner />
return <h1>{user.name}</h1>
```

O compilador transforma em uma condicional reativa (ver [09-condicionais](09-condicionais.md)).

## O que o dev **não** pode fazer (e o compilador avisa)

| Padrão | Por que quebra | Mensagem do compilador |
|---|---|---|
| `return` dentro de `for`/`while`/`try` no corpo do componente | Não dá para transformar em branch com segurança | Erro com sugestão de reescrita |
| `let` lido dentro de `setTimeout` esperando valor congelado | Lê sempre o valor atual (isso é bom, mas surpreende quem vem do React) | Aviso apenas em modo estrito |
| Desestruturar um `store` no topo do componente (`const { x } = pos`) | Copia o valor | Compilador transforma em derivado automaticamente |
