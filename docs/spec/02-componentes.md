# 02 — Componentes

## Definição

Um componente é uma função com nome em **PascalCase** que retorna JSX, declarada em um arquivo `.tsx`. Declaração, arrow ou `export default`, tanto faz.

```tsx
export function Hello({ name }: { name: string }) {
  return <h1>Olá, {name}!</h1>
}

export const Card = ({ title, children }: ParentProps<{ title: string }>) => (
  <section class="card"><h2>{title}</h2>{children}</section>
)
```

Pode retornar: um elemento, um fragmento, um array, `null`/`false`/`undefined` (renderiza só a âncora) ou uma `Promise` de qualquer um desses ([07](07-async.md)).

Tipos utilitários opcionais: `Component<P>`, `ParentProps<P>` (adiciona `children?: JSX.Element`), `JSX.Element`.

## Props

```tsx
function Avatar({ user, size = 32, class: cls, ...rest }: AvatarProps) {
  return <img src={user.avatarUrl} width={size} class={cls} {...rest} />
}
```

- **Destructuring é seguro.** O compilador reescreve cada uso para um getter (`props.user`), então a reatividade não se perde.
- **Valores padrão** funcionam (`size = 32`).
- **Rest/spread** preserva os getters: `{...rest}` em um elemento gera um binding por chave.
- Um filho só reage à mudança de uma prop **se a lê**, e só no binding que a lê. Se `Avatar` não usa `size` no JSX, mudar `size` no pai não custa nada.
- Props são **somente leitura** (tipo `Readonly<P>`). Para "estado inicial vindo de prop", copie com `let` ([01](01-modelo-mental.md#o-inicializador-roda-uma-vez)).
- Passar uma prop para uma função `use*` mantém a reatividade (o argumento é lazy). Passar para uma função comum entrega o **valor atual**; se a chamada estiver em um `const`, ela vira um derivado e refaz quando a prop muda.

### Children e slots

Slots são props com JSX. Sem API nova.

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

<Layout header={<Logo />} sidebar={<Menu />}><Dashboard /></Layout>
```

- Slots são **lazy**: `<Menu />` só é criado se `Layout` renderizar `sidebar`.
- `children` lido mais de uma vez é **memoizado por instância**: os nós não são criados duas vezes.

### Render props

```tsx
function List<T>({ items, children }: { items: T[]; children: (item: T) => JSX.Element }) {
  return <ul>{items.map(item => <li>{children(item)}</li>)}</ul>
}

<List items={users}>{user => <UserCard user={user} />}</List>
```

Componentes genéricos usam a inferência normal do TS.

### Slots nomeados: `<Slot>` + `useSlots`

Para colocar pedaços dos `children` em lugares diferentes, por nome, sem o `Children.map` + `child.type === X` do React:

```tsx
import { Slot, useSlots } from 'jotastic'

function Card({ children }: ParentProps) {
  const slots = useSlots<{ header: JSX.Element; footer: JSX.Element; row: (item: Item) => JSX.Element }>(children)
  return (
    <section class="card">
      {slots.header && <header>{slots.header}</header>}
      <div class="body">{slots.default}</div>
      <ul>{items.map(i => <li key={i.id}>{slots.row?.(i)}</li>)}</ul>
      {slots.footer && <footer>{slots.footer}</footer>}
    </section>
  )
}

<Card>
  <Slot name="header"><h2>Título</h2></Slot>
  <p>Corpo do card</p>                                              {/* → slots.default */}
  <Slot name="row">{(item: Item) => <b>{item.name}</b>}</Slot>      {/* slot com parâmetro */}
  {admin && <Slot name="footer"><button>Excluir</button></Slot>}   {/* condicional: slots.footer é reativo */}
</Card>
```

- **Resolvido em build**: o compilador vê os `<Slot name>` diretos (também dentro de fragmentos, `&&` e ternários) e transforma os `children` em `{ header, footer, row, default }`, cada um um getter lazy. Zero filtragem em runtime.
- `slots.x` é tipado pelo mapa passado a `useSlots` e é reativo; um slot com função vira `(…args) => JSX.Element`.
- `<Slot>` dentro de `.map`, de outro elemento ou de outro componente é erro `slot-not-direct-child`.
- Sem `useSlots`, `{children}` continua funcionando como sempre.
- Não há API genérica para filtrar children por tipo: depois de rodar, um componente vira nós do DOM. Para o caso "embrulhar cada filho em `<li>`", `useChildren(children)` devolve o array de nós (fase 2).

## `key` em componentes

```tsx
<ProfileForm key={user.id} user={user} />
```

Quando `key` muda, a instância é descartada e recriada (estado local reseta). É o jeito de dizer "isto é outro registro".

## `ref`

```tsx
let input!: HTMLInputElement
<input ref={input} />
onMount(() => input.focus())
```

- `ref` em elemento HTML recebe o elemento, atribuído **antes** de `onMount`.
- Em elementos condicionais, declare como opcional (`let input: HTMLInputElement | undefined`): o `ref` volta a `undefined` quando o branch sai.
- Ler o `ref` no corpo raiz (fora de `onMount`/`external`/handler) é erro de compilação (`ref-before-mount`).
- `ref` em componente + `expose({...})` para expor métodos: **fase 2** ([14](14-roadmap.md)).

## Composição avançada

### Componentes compostos e contexto (fase 2)

```tsx
const TabsContext = createContext<TabsState>()      // fase 2

export function Tabs({ children }: ParentProps) {
  let active = ''
  return <TabsContext.Provider value={{ get active() { return active }, select: id => (active = id) }}>{children}</TabsContext.Provider>
}
Tabs.Tab = function Tab({ id, children }: ParentProps<{ id: string }>) {
  const tabs = useContext(TabsContext)
  return <button class={{ active: tabs.active === id }} onClick={() => tabs.select(id)}>{children}</button>
}
```

`useContext` lê o Provider mais próximo na árvore de owners (sem Provider global). `value` é lido de forma lazy: se for reativo, os consumidores acompanham. No MVP, use um store local passado por prop.

### Portal

```tsx
<Portal to={document.body}><Modal /></Portal>
```

Renderiza os filhos em outro ponto do DOM mantendo o owner (efeitos, erros e contexto) no lugar de origem. Entra no M5.

### Diretivas `use:` (fase 2)

```tsx
function tooltip(el: HTMLElement, text: () => string) { /* watch + onCleanup */ }
<button use:tooltip="Salvar">💾</button>
```

## Bootstrap

```tsx
import { mount } from 'jotastic'

const unmount = mount(<App />, '#app')                      // seletor ou Element

mount(<App />, '#app', {
  plugins: [devtools(), router(routes)],                    // (app) => void
  onError: (err, info) => report(err, info.component),      // erros não capturados por <Boundary>
})
```

- Uma função, um objeto de opções, retorna `unmount()`.
- **Múltiplas raízes** são naturais e compartilham stores: `mount(<CartBadge />, '#header-cart'); mount(<Products />, '#products')`. Serve para adoção gradual em páginas server-rendered.

## Anatomia recomendada

```tsx
export function UserCard({ user, compact = false, onSelect }: Props) {
  let expanded = false                                           // 1. estado
  const initials = user.name.split(' ').map(p => p[0]).join('')  // 2. derivados
  on(window, 'keydown', e => e.key === 'Escape' && (expanded = false))  // 3. efeitos
  function toggle() { expanded = !expanded }                     // 4. funções
  return (                                                       // 5. UI
    <article class={{ card: true, compact }} onClick={() => onSelect?.(user)}>
      <span class="avatar">{initials}</span>
      <h3>{user.name}</h3>
      {expanded && <p>{user.bio}</p>}
      <button onClick={toggle}>{expanded ? 'Menos' : 'Mais'}</button>
    </article>
  )
}
```

Estrutura de projeto sugerida: `main.tsx`, `App.tsx`, `pages/`, `components/`, `stores/`, `lib/` (com as funções `use*`).
