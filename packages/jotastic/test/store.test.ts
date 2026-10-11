import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createOwner, effect, flush, isReactive, runWithOwner, type DevtoolsEvent } from '../src/runtime/index'
import { createStore } from '../src/store'

type Hook = { emit: (e: DevtoolsEvent) => void; registry: { owners: Map<number, unknown> } }
const g = globalThis as { __JOTASTIC_DEVTOOLS__?: Hook }
let events: DevtoolsEvent[] = []

beforeEach(() => {
  events = []
  g.__JOTASTIC_DEVTOOLS__ = { emit: (e) => events.push(e), registry: { owners: new Map() } }
})

afterEach(() => {
  flush()
  delete g.__JOTASTIC_DEVTOOLS__
  vi.restoreAllMocks()
})

const flushes = () => events.filter((e) => e.type === 'flush:start').length

/** Efeito de usuário que conta execuções; já roda a primeira vez. */
function counter(fn: () => unknown): { runs: number } {
  const c = { runs: 0 }
  runWithOwner(createOwner('root', null), () =>
    effect(() => {
      c.runs++
      fn()
    }),
  )
  flush()
  return c
}

interface Item {
  id: string
  qty: number
}

describe('store (S1–S6)', () => {
  test('S1 ação síncrona com 3 set → 1 flush', () => {
    interface S {
      a: number
      b: number
      c: number
      bump(): void
    }
    const s = createStore<S>((set) => ({
      a: 0,
      b: 0,
      c: 0,
      bump: () => {
        set({ a: 1 })
        set((d) => ({ b: d.a + 1 }))
        set((d) => {
          d.c = d.b + 1
        })
      },
    }))
    const seen: string[] = []
    const c = counter(() => seen.push(`${s.a}${s.b}${s.c}`))
    events = []
    s.bump()
    expect(flushes()).toBe(1)
    expect(c.runs).toBe(2)
    expect(seen).toEqual(['000', '123'])
    // devtools: uma entrada por ação, com as chaves que mudaram
    const actions = events.filter((e) => e.type === 'store:action')
    expect(actions).toEqual([
      { type: 'store:action', store: 'store', action: 'bump', args: [], changed: ['a', 'b', 'c'] },
    ])
  })

  test('S2 set objeto / fn com retorno / fn mutadora: mesmo resultado; só assinantes das chaves mudadas rodam', () => {
    interface S {
      a: number
      b: { x: number }
      items: Item[]
      run(): void
    }
    const variants: Array<(set: Parameters<Parameters<typeof createStore<S>>[0]>[0]) => void> = [
      (set) => set({ a: 2, items: [{ id: 'x', qty: 1 }] }),
      (set) => set((d) => ({ a: d.a + 1, items: [...d.items, { id: 'x', qty: 1 }] })),
      (set) =>
        set((d) => {
          d.a++
          d.items.push({ id: 'x', qty: 1 })
        }),
    ]
    for (const update of variants) {
      const b = { x: 1 }
      const s = createStore<S>((set) => ({ a: 1, b, items: [], run: () => update(set) }), { name: 'v' })
      const ca = counter(() => s.a)
      const cb = counter(() => s.b.x)
      const ci = counter(() => s.items.map((i) => i.qty))
      s.run()
      expect(s.$snapshot()).toEqual({ a: 2, b: { x: 1 }, items: [{ id: 'x', qty: 1 }] })
      expect(ca.runs).toBe(2)
      expect(cb.runs).toBe(1)
      expect(ci.runs).toBe(2)
    }

    // folha com Object.is igual é no-op; objeto novo troca a referência (notifica mesmo com conteúdo igual)
    const s = createStore<{ a: number; b: { x: number }; same(): void; swap(): void }>((set) => ({
      a: 1,
      b: { x: 1 },
      same: () => set({ a: 1 }),
      swap: () => set({ b: { x: 1 } }),
    }))
    const ca = counter(() => s.a)
    const cb = counter(() => s.b)
    s.same()
    expect(ca.runs).toBe(1)
    s.swap()
    expect(cb.runs).toBe(2)
  })

  test('S3 getter é memo: recalcula só quando o que lê muda', () => {
    let computed = 0
    interface S {
      items: Item[]
      other: number
      readonly count: number
      readonly double: number
      add(id: string): void
      touch(): void
    }
    const s = createStore<S>((set, get) => ({
      items: [],
      other: 0,
      get count() {
        computed++
        return get().items.reduce((n, i) => n + i.qty, 0)
      },
      get double() {
        return get().count * 2
      },
      add: (id) =>
        set((d) => {
          d.items.push({ id, qty: 2 })
        }),
      touch: () => set((d) => ({ other: d.other + 1 })),
    }))
    expect(s.count).toBe(0)
    expect(s.count).toBe(0)
    expect(computed).toBe(1)
    s.touch()
    expect(s.count).toBe(0)
    expect(computed).toBe(1)
    s.add('a')
    expect(s.double).toBe(4)
    expect(s.count).toBe(2)
    expect(computed).toBe(2)
    const c = counter(() => s.double)
    s.touch()
    expect(c.runs).toBe(1)
    s.add('b')
    expect(c.runs).toBe(2)
    expect(s.double).toBe(8)
    // desestruturação lê o valor atual do memo
    const { count } = s
    expect(count).toBe(4)
  })

  test('S4 ação async: trecho síncrono é um flush; cada set depois do await é seu próprio flush', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    interface S {
      a: number
      b: number
      c: number
      load(): Promise<void>
    }
    const s = createStore<S>((set) => ({
      a: 0,
      b: 0,
      c: 0,
      load: async () => {
        set({ a: 1 })
        set({ b: 1 })
        await gate
        set({ b: 2 })
        set({ c: 2 })
      },
    }))
    const seen: string[] = []
    counter(() => seen.push(`${s.a}${s.b}${s.c}`))
    events = []
    const p = s.load()
    expect(flushes()).toBe(1)
    expect(seen).toEqual(['000', '110'])
    release()
    await p
    expect(flushes()).toBe(3)
    expect(seen).toEqual(['000', '110', '120', '122'])
    const actions = events.filter((e) => e.type === 'store:action').map((e) => e.type === 'store:action' && e.changed)
    expect(actions).toEqual([['a', 'b'], ['b'], ['c']])
  })

  test('S5 mutação fora de ação avisa store-mutated-outside-action (dev)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    interface S {
      n: number
      items: Item[]
      inc(): void
    }
    const s = createStore<S>(
      (set, get) => ({
        n: 0,
        items: [{ id: 'a', qty: 1 }],
        inc: () => {
          get().n++ // get() é mutável dentro da ação
          set((d) => {
            d.items[0]!.qty++
          })
        },
      }),
      { name: 'cart' },
    )
    const w = s as unknown as { n: number; items: Item[] }
    w.n = 5
    w.items.push({ id: 'b', qty: 1 })
    w.items[0]!.qty = 9
    // push escreve índice e length: um aviso por escrita (P-4)
    const warned = warn.mock.calls.length
    expect(warned).toBeGreaterThanOrEqual(3)
    expect(warn.mock.calls.every((c) => String(c[0]).includes('store-mutated-outside-action'))).toBe(true)
    expect(String(warn.mock.calls[0]![0])).toContain('cart')
    expect(events.some((e) => e.type === 'warn' && e.id === 'store-mutated-outside-action')).toBe(true)
    expect(s.n).toBe(0)
    expect(s.items.length).toBe(1)
    expect(s.items[0]!.qty).toBe(1)
    s.inc()
    expect(warn).toHaveBeenCalledTimes(warned)
    expect(s.n).toBe(1)
    expect(s.items[0]!.qty).toBe(2)
  })

  test('S6 $snapshot é cópia sem proxy; $reset volta ao inicial', () => {
    let runs = 0
    interface S {
      items: Item[]
      coupon: string | null
      readonly count: number
      add(id: string): void
    }
    const s = createStore<S>(
      (set, get) => {
        runs++
        return {
          items: [],
          coupon: null,
          get count() {
            return get().items.length
          },
          add: (id) => set((d) => ({ items: [...d.items, { id, qty: 1 }], coupon: 'X' })),
        }
      },
      { name: 'cart' },
    )
    expect(s.$name).toBe('cart')
    s.add('a')
    const snap = s.$snapshot()
    expect(snap).toEqual({ items: [{ id: 'a', qty: 1 }], coupon: 'X', count: 1 })
    expect(isReactive(snap)).toBe(false)
    expect(isReactive(snap.items)).toBe(false)
    expect(isReactive(snap.items[0])).toBe(false)
    snap.items[0]!.qty = 99
    expect(s.items[0]!.qty).toBe(1)

    const c = counter(() => s.count)
    s.$reset()
    expect(runs).toBe(2)
    expect(s.$snapshot()).toEqual({ items: [], coupon: null, count: 0 })
    expect(c.runs).toBe(2)
    // ações continuam funcionando depois do reset
    s.add('b')
    expect(s.count).toBe(1)
  })
})
