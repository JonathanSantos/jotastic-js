# 10 — Store: um "mini Zustand" reativo

## Faz sentido?

**Sim, com uma adaptação importante.** O Zustand é amado por três motivos:

1. Store fora da árvore de componentes (sem Provider)
2. Estado e ações juntos em um objeto simples
3. API mínima (`create`, `set`, `get`)

Mas parte do Zustand existe **só por causa do modelo do React**: seletores (`useStore(s => s.items)`), `shallow` e `useShallow` servem para evitar re-renders. No Jotastic a leitura já é rastreada por propriedade pelo proxy profundo, então **seletores não são necessários**.

```tsx
// React + Zustand
const items = useCart(s => s.items)             // seletor para não re-renderizar à toa
const total = useCart(s => s.total())
const add = useCart(s => s.add)

// Jotastic
cart.items                                      // leitura direta; só o binding que lê `items` reage
cart.total
cart.add(item)
```

Ficamos com o melhor do Zustand (a API) sem o que ele precisa para contornar o React.

---

## API proposta

> **D15 (decidido):** somente o estilo Zustand, com a factory `(set, get)`. Não haverá variante com `this`.

```ts
import { createStore } from 'jotastic/store'

export const cart = createStore((set, get) => ({
  // estado
  items: [] as CartItem[],
  coupon: null as string | null,

  // derivados (getters viram computed memoizados)
  get count() {
    return get().items.reduce((n, i) => n + i.qty, 0)
  },
  get total() {
    const { items, coupon } = get()
    const sum = items.reduce((s, i) => s + i.price * i.qty, 0)
    return coupon ? sum * 0.9 : sum
  },

  // ações
  add: (product: Product) =>
    set(s => {
      const existing = s.items.find(i => i.id === product.id)
      if (existing) existing.qty++                         // mutação direta (proxy)
      else s.items.push({ ...product, qty: 1 })
    }),

  remove: (id: string) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

  applyCoupon: async (code: string) => {
    const ok = await api.validateCoupon(code)
    if (ok) set({ coupon: code })                           // merge parcial
  },
}))
```

### `set` aceita três formas

| Forma | Exemplo | Comportamento |
|---|---|---|
| Objeto parcial | `set({ coupon: 'X' })` | Merge raso com **reconcile** (ver abaixo) |
| Função que retorna parcial | `set(s => ({ items: [...s.items, x] }))` | Estilo Zustand imutável, também com reconcile |
| Função mutadora | `set(s => { s.items.push(x) })` | Estilo Immer: muta o proxy direto |

As três disparam **somente** os assinantes das propriedades que de fato mudaram. Como o `set` imutável passa por reconcile, `items: [...s.items, x]` notifica só a inserção do novo item, sem re-renderizar a lista inteira.

### Ações rodam em batch

Toda chamada de ação (síncrona, ou o trecho síncrono de uma `async`) é agrupada: várias alterações resultam em uma única rodada de atualização.

### Leitura em componentes

```tsx
import { cart } from '../stores/cart'

export function CartSummary() {
  return (
    <aside>
      <p>{cart.count} itens</p>
      <p>Total: {format(cart.total)}</p>
      {cart.items.map(i => <CartLine key={i.id} item={i} onRemove={() => cart.remove(i.id)} />)}
    </aside>
  )
}
```

Desestruturar no topo do componente também funciona, porque o compilador transforma em derivado:

```tsx
const { count, total } = cart     // vira computed, então continua reativo
```

### Utilitários do store (prefixo `$` para não colidir com o estado)

```ts
cart.$subscribe(s => s.total, (total, prev) => analytics.track('total', total))  // fora da UI
cart.$snapshot()          // cópia plana, sem proxy (para logs/serialização)
cart.$reset()             // volta ao estado inicial
cart.$name                // nome para o devtools (inferido do export: "cart")
```

### Middlewares

```ts
export const settings = createStore(
  persist({ key: 'settings', storage: localStorage }, (set) => ({
    theme: 'light' as 'light' | 'dark',
    toggleTheme: () => set(s => ({ theme: s.theme === 'light' ? 'dark' : 'light' })),
  }))
)
```

MVP: `persist`. Pós-MVP: `history` (undo/redo), `sync` (entre abas via BroadcastChannel).

---

## Quando usar `let` local vs. store

| Situação | Use |
|---|---|
| Estado que só um componente usa (input, aberto/fechado, aba ativa) | `let` no componente |
| Estado lido por componentes distantes (usuário logado, carrinho, tema) | `createStore` em `stores/` |
| Estado de um componente composto (Tabs ↔ Tab) | Store local passado por prop, ou contexto (pós-MVP) |
| Dados de servidor | `await` no componente (ver [11](11-async-no-componente.md)) |

## Stores com escopo (pós-MVP)

Para múltiplas instâncias (ex.: dois editores na mesma tela) ou testes isolados:

```tsx
const EditorStore = defineStore(() => ({ /* ... */ }))

<EditorStore.Provider>       {/* cada Provider cria uma instância */}
  <Toolbar />                {/* EditorStore.use() pega a mais próxima */}
</EditorStore.Provider>
```

## Implementação

- Construído sobre o `store()` do runtime (proxy profundo e lazy, ver [04-runtime](04-runtime.md)).
- `createStore` ≈ 100 linhas: chama a factory com `set`/`get`, separa estado, getters e funções, envolve as funções em `batch` e registra no devtools em modo dev.
- Tamanho alvo: < 1 KB gzip adicional.
