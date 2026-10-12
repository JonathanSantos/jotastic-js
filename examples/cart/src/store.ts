// docs/spec/examples/08-store.ts com ajustes mínimos marcados com `[ajuste]`.
import { createStore } from 'jotastic/store'
import { api } from './api' // [ajuste] stub no lugar de `declare const api`

export interface Product {
  id: string
  name: string
  price: number
}
export interface CartItem extends Product {
  qty: number
}

export const cart = createStore(
  // estado (o tipo é inferido daqui)
  { items: [] as CartItem[], coupon: null as string | null, couponError: null as string | null },

  // membros: getters viram memos, funções viram ações
  (set, get) => ({
    get count() {
      return get().items.reduce((n, i) => n + i.qty, 0)
    },
    get subtotal() {
      return get().items.reduce((s, i) => s + i.price * i.qty, 0)
    },
    // [ajuste] `get()` é tipado só com o estado (S); getter lendo outro getter usa `this`
    get total() {
      return get().coupon ? this.subtotal * 0.9 : this.subtotal
    },
    get isEmpty() {
      return get().items.length === 0
    },

    // ações: único lugar que muda o estado
    add: (product: Product) =>
      set((s) => {
        const existing = s.items.find((i) => i.id === product.id)
        if (existing)
          existing.qty++ // mutação no draft
        else s.items.push({ ...product, qty: 1 })
      }),
    setQty: (id: string, qty: number) =>
      set((s) => {
        const item = s.items.find((i) => i.id === id)
        if (!item) return
        if (qty <= 0) s.items.splice(s.items.indexOf(item), 1)
        else item.qty = qty
      }),
    remove: (id: string) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), // retorno = merge
    clear: () => set({ items: [], coupon: null }),

    applyCoupon: async (code: string) => {
      set({ couponError: null })
      const ok = await api.validateCoupon(code) // depois do await, `set` continua funcionando
      if (ok) set({ coupon: code })
      else set({ couponError: 'Cupom inválido' })
    },
  }),
)

// cart.items.push(x)   → erro de TS (DeepReadonly) e aviso em dev: use as ações
// cart.$snapshot()     → cópia plana para logs / testes
// cart.$reset()        → estado inicial
