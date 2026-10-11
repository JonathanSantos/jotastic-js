// Cópia de docs/spec/examples/08-store.ts com ajustes mínimos marcados com `[patch]` (erros de tipo do próprio exemplo).
import { createStore } from 'jotastic/store'

export interface Product { id: string; name: string; price: number }
export interface CartItem extends Product { qty: number }

// [patch] createStore não infere S quando a factory usa `get()` sem anotação: tipo explícito
interface CartState {
  items: CartItem[]
  coupon: string | null
  couponError: string | null
  readonly count: number
  readonly subtotal: number
  readonly total: number
  readonly isEmpty: boolean
  add(product: Product): void
  setQty(id: string, qty: number): void
  remove(id: string): void
  clear(): void
  applyCoupon(code: string): Promise<void>
}

export const cart = createStore<CartState>((set, get) => ({
  // estado
  items: [] as CartItem[],
  coupon: null as string | null,
  couponError: null as string | null,

  // derivados (getters viram memos)
  get count() { return get().items.reduce((n, i) => n + i.qty, 0) },
  get subtotal() { return get().items.reduce((s, i) => s + i.price * i.qty, 0) },
  get total() { return get().coupon ? get().subtotal * 0.9 : get().subtotal },
  get isEmpty() { return get().items.length === 0 },

  // ações: único lugar que muda o estado
  add: (product: Product) => set(s => {
    const existing = s.items.find(i => i.id === product.id)
    if (existing) existing.qty++                           // mutação no draft
    else s.items.push({ ...product, qty: 1 })
  }),
  setQty: (id: string, qty: number) => set(s => {
    const item = s.items.find(i => i.id === id)
    if (!item) return
    if (qty <= 0) s.items.splice(s.items.indexOf(item), 1)
    else item.qty = qty
  }),
  remove: (id: string) => set(s => ({ items: s.items.filter(i => i.id !== id) })),   // retorno = merge
  clear: () => set({ items: [], coupon: null }),

  applyCoupon: async (code: string) => {
    set({ couponError: null })
    const ok = await api.validateCoupon(code)          // depois do await, cada set é seu próprio batch
    if (ok) set({ coupon: code })
    else set({ couponError: 'Cupom inválido' })
  },
}))

// cart.items.push(x)   → erro de TS (DeepReadonly) e aviso em dev: use as ações
// cart.$snapshot()     → cópia plana para logs / testes
// cart.$reset()        → estado inicial

declare const api: { validateCoupon(code: string): Promise<boolean> }
