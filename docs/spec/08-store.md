# 08 — Store

Um "mini Zustand" reativo: store fora da árvore, sem Provider, estado e ações juntos, **sem seletores** (o proxy rastreia por propriedade).

```ts
import { createStore } from 'jotastic/store'

export const cart = createStore(
  // 1) estado: o tipo é inferido daqui
  { items: [] as CartItem[], coupon: null as string | null },

  // 2) membros: getters viram memos, funções viram ações
  (set, get) => ({
    get count() { return get().items.reduce((n, i) => n + i.qty, 0) },
    get total() {
      const { items, coupon } = get()
      const sum = items.reduce((s, i) => s + i.price * i.qty, 0)
      return coupon ? sum * 0.9 : sum
    },

    add: (product: Product) => set(s => {
      const existing = s.items.find(i => i.id === product.id)
      if (existing) existing.qty++                        // mutação no draft
      else s.items.push({ ...product, qty: 1 })
    }),
    remove: (id: string) => set(s => ({ items: s.items.filter(i => i.id !== id) })),   // retorno = merge
    applyCoupon: async (code: string) => {
      const ok = await api.validateCoupon(code)
      if (ok) set({ coupon: code })
    },
  }),
)
```

Dois argumentos (D62): o estado dá o tipo por inferência, sem interface nem generics; os membros são tipados com ele. O estado pode ser uma função (`() => ({ … })`) quando precisa ser recriado no `$reset`.

## `set` tem uma assinatura

`set(parcial | (draft) => parcial | void)`

- Objeto parcial: merge raso.
- Função que **retorna** um objeto: merge raso do retorno.
- Função que **não retorna**: as mutações feitas no `draft` valem.

Em todos os casos só os assinantes das propriedades que de fato mudaram são notificados (`Object.is` por folha; troca de referência para objetos). `reconcile()` para manter identidade em dados de servidor é opt-in na fase 2.

## Estado é somente leitura fora das ações

- O tipo exposto é `DeepReadonly`: `cart.items.push(x)` é erro de TS.
- Em dev, uma escrita direta via proxy avisa `store-mutated-outside-action` com arquivo e linha.
- Há um só caminho para mudar o store: as ações. O histórico do devtools é completo.

## Ações e batch

- Cada ação síncrona (e o trecho síncrono de uma ação async) é um batch: uma rodada de atualização no próximo microtask, como todo o resto da lib (D61).
- Depois de cada `await`, `set` continua funcionando sem contexto de ação. Não existe `runInAction`.

## Leitura em componentes

```tsx
<p>{cart.count} itens — Total: {format(cart.total)}</p>
{cart.items.map(i => <CartLine key={i.id} item={i} onRemove={() => cart.remove(i.id)} />)}

const { count, total } = cart        // no corpo raiz vira dois derivados; continua reativo
```

## Utilitários (prefixo `$`)

```ts
cart.$subscribe(s => s.total, (total, prev) => analytics.track('total', total))   // fase 2
cart.$snapshot()      // cópia plana do estado, sem proxy, sem getters nem ações
cart.$reset()         // volta ao primeiro argumento
cart.$name            // nome para o devtools (inferido do export)
```

MVP: `$snapshot`, `$reset`. Fase 2: `$subscribe`, middlewares `persist` (com `version`, `migrate` e allowlist de chaves desde o desenho), `history`, `sync`.

## Stores com escopo (fase 2)

```tsx
const EditorStore = defineStore((set, get) => ({ … }))
<EditorStore.Provider><Toolbar /></EditorStore.Provider>    // Toolbar: EditorStore.use()
```

## Implementação

Construído sobre `reactive()` do runtime (proxy profundo e lazy). ~100 linhas: `reactive(state)`, chama `members(set, get)`, getters → memos, funções → `batch` + `inAction`, visão readonly fora de ações, registra no devtools em dev. Alvo: < 1 KB gzip adicional.
