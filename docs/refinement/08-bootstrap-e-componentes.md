# 08 — Modo de uso: bootstrap e criação de componentes

Este documento explora **como o dev usa a lib no dia a dia**: como a app sobe no DOM, como se cria um componente e os padrões de composição. Cada seção tem opções e uma recomendação.

---

## 1. Bootstrap da aplicação

### Opção A — `mount` minimalista

```tsx
// main.tsx
import { mount } from 'jotastic'
import { App } from './App'

mount(<App />, '#app')            // aceita seletor ou Element
```

- Zero cerimônia, ótimo para o primeiro contato.
- `mount` retorna `unmount()`.

### Opção B — `createApp` com plugins

```tsx
// main.tsx
import { createApp } from 'jotastic'
import { devtools } from '@jotastic/devtools'
import { router } from './router'
import { App } from './App'

createApp(<App />)
  .use(router)
  .use(devtools())                // só em dev (removido no build de produção)
  .onError((err, info) => reportError(err, info.component))
  .mount('#app')
```

- Ponto central para plugins (router, devtools, i18n), tratamento de erro global e configuração.
- Retorna `app` com `.unmount()`.

### Opção C — Bootstrap por convenção (zero código)

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="./src/App.tsx" data-mount="#app"></script>
```

O plugin Vite gera o `main` automaticamente. É prático, mas esconde demais.

### Recomendação

**A + B juntos**: `mount()` é açúcar para `createApp(el).mount(target)`. O tutorial começa com `mount`, e quem precisar de plugins usa `createApp`.

### Múltiplas raízes (widgets / ilhas)

Como não há uma "árvore global" como no React, montar várias raízes independentes é natural, e elas podem compartilhar stores:

```tsx
mount(<CartBadge />, '#header-cart')
mount(<ProductList />, '#products')
```

Isso facilita adotar Jotastic aos poucos em páginas existentes (server-rendered, WordPress, Rails...).

---

## 2. Anatomia de um componente

### Forma padrão (recomendada)

```tsx
// components/UserCard.tsx
import { watch, onMount } from 'jotastic'

interface Props {
  user: User
  compact?: boolean
  onSelect?: (user: User) => void
}

export function UserCard({ user, compact = false, onSelect }: Props) {
  // 1. Estado local
  let expanded = false

  // 2. Derivados
  const initials = user.name.split(' ').map(p => p[0]).join('')

  // 3. Efeitos e ciclo de vida
  onMount(() => console.log('montado'))

  // 4. Funções (estáveis, sem useCallback)
  function toggle() {
    expanded = !expanded
  }

  // 5. UI
  return (
    <article class={{ card: true, compact }} onClick={() => onSelect?.(user)}>
      <span class="avatar">{initials}</span>
      <h3>{user.name}</h3>
      {expanded && <p>{user.bio}</p>}
      <button onClick={toggle}>{expanded ? 'Menos' : 'Mais'}</button>
    </article>
  )
}
```

Regras:
- Uma função **PascalCase** que retorna JSX em um arquivo `.tsx`.
- Arrow functions também valem: `export const UserCard = (props: Props) => ...`.
- Recomendação de estilo: uma ordem fixa (estado → derivados → efeitos → funções → UI), validada por lint opcional.

### Tipo utilitário `Component`

```ts
import type { Component, ParentProps } from 'jotastic'

export const Card: Component<ParentProps<{ title: string }>> = ({ title, children }) => (
  <section>
    <h2>{title}</h2>
    {children}
  </section>
)
```

Opcional, para quem prefere tipar o componente inteiro.

---

## 3. Padrões de composição

### Children e slots nomeados

Slots são props com JSX. Sem API nova:

```tsx
function Layout({ header, sidebar, children }: {
  header: JSX.Element
  sidebar?: JSX.Element
  children: JSX.Element
}) {
  return (
    <div class="layout">
      <header>{header}</header>
      {sidebar && <aside>{sidebar}</aside>}
      <main>{children}</main>
    </div>
  )
}

<Layout header={<Logo />} sidebar={<Menu />}>
  <Dashboard />
</Layout>
```

> Os slots são **lazy**: o compilador passa `header` como getter, então `<Menu />` só é criado se o `Layout` de fato renderizar o `sidebar`.

### Render props (slots com parâmetro)

```tsx
function List<T>({ items, children }: { items: T[]; children: (item: T) => JSX.Element }) {
  return <ul>{items.map(item => <li>{children(item)}</li>)}</ul>
}

<List items={users}>
  {user => <UserCard user={user} />}
</List>
```

Componentes genéricos (`List<T>`) funcionam com a inferência normal do TS.

### Componentes compostos

```tsx
export function Tabs({ children }: ParentProps) { /* ... */ }
Tabs.Tab = function Tab({ id, children }: ParentProps<{ id: string }>) { /* ... */ }

<Tabs>
  <Tabs.Tab id="perfil">...</Tabs.Tab>
  <Tabs.Tab id="config">...</Tabs.Tab>
</Tabs>
```

A comunicação entre `Tabs` e `Tabs.Tab` usa contexto (pós-MVP) ou um store local passado como prop.

### Spread de props

```tsx
function Button({ variant = 'primary', ...rest }: ButtonProps) {
  return <button class={`btn btn-${variant}`} {...rest} />
}
```

O compilador gera um `splitProps` que **preserva os getters**, então a reatividade não se perde no spread.

### Expor métodos (sem `forwardRef` / `useImperativeHandle`)

```tsx
function Dialog({ children }: ParentProps) {
  let open = false
  let el!: HTMLDialogElement

  expose({
    open: () => { open = true; el.showModal() },
    close: () => { open = false; el.close() },
  })

  return <dialog ref={el}>{children}</dialog>
}

// uso
let dialog!: ExposedOf<typeof Dialog>
<Dialog ref={dialog}>...</Dialog>
<button onClick={() => dialog.open()}>Abrir</button>
```

- `ref` em elemento HTML retorna o elemento.
- `ref` em componente retorna o que ele passou para `expose()`, tipado.

### Diretivas de elemento (`use:`)

Comportamentos reutilizáveis aplicados a elementos, sem wrapper:

```tsx
function tooltip(el: HTMLElement, text: () => string) {
  const tip = createTip(el)
  watch(() => tip.setText(text()))
  onCleanup(() => tip.destroy())
}

<button use:tooltip="Salvar alterações">💾</button>
```

Úteis para foco, clique fora, drag, autosize, intersection observer...

### Tratamento de erro

```tsx
<Catch fallback={(err, retry) => <ErrorBox error={err} onRetry={retry} />}>
  <Dashboard />
</Catch>
```

Captura erros de setup, de bindings e de `await` (ver [11-async](11-async-no-componente.md)). `retry` recria a subárvore.

---

## 4. Estrutura sugerida de projeto

```
src/
├─ main.tsx                 # bootstrap
├─ App.tsx
├─ pages/                   # telas
│  ├─ Home.tsx
│  └─ UserDetail.tsx
├─ components/              # componentes reutilizáveis
│  ├─ Button.tsx
│  └─ UserCard.tsx
├─ stores/                  # estado compartilhado (ver 10-store)
│  └─ cart.ts
└─ lib/
   └─ api.ts
```

---

## 5. Exemplo de ponta a ponta: uma tela

```tsx
// stores/todos.ts
import { createStore } from 'jotastic/store'

export const todos = createStore((set, get) => ({
  items: [] as Todo[],
  filter: 'all' as 'all' | 'active' | 'done',

  get visible() {
    const { items, filter } = get()
    return filter === 'all' ? items : items.filter(t => (filter === 'done') === t.done)
  },

  add: (text: string) => set(s => { s.items.push({ id: crypto.randomUUID(), text, done: false }) }),
  toggle: (todo: Todo) => set(() => { todo.done = !todo.done }),
  setFilter: (filter: 'all' | 'active' | 'done') => set({ filter }),
}))
```

```tsx
// pages/TodoPage.tsx
import { todos } from '../stores/todos'

export function TodoPage() {
  let draft = ''

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    todos.add(draft)
    draft = ''
  }

  return (
    <section>
      <form onSubmit={submit}>
        <input bind:value={draft} placeholder="O que fazer?" />
      </form>

      <ul>
        {todos.visible.map(todo => (
          <li key={todo.id} class={{ done: todo.done }} onClick={() => todos.toggle(todo)}>
            {todo.text}
          </li>
        ))}
      </ul>

      <nav>
        {(['all', 'active', 'done'] as const).map(f => (
          <button class={{ active: todos.filter === f }} onClick={() => todos.setFilter(f)}>
            {f}
          </button>
        ))}
      </nav>
    </section>
  )
}
```

```tsx
// main.tsx
import { mount } from 'jotastic'
import { TodoPage } from './pages/TodoPage'

mount(<TodoPage />, '#app')
```

O que acontece em runtime:
- Digitar no input atualiza `draft` e **só** o `value` do input. A lista não é tocada.
- Clicar num item muda `todo.done`: atualiza **só** a classe daquele `<li>` (e a lista, se o filtro o esconder).
- Trocar o filtro atualiza a lista com reconciliação por chave e a classe `active` dos 3 botões.
- `TodoPage` executa **uma vez** durante toda a vida da tela.
