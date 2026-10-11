import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createOwner,
  effect,
  flush,
  isReactive,
  memo,
  raw,
  reactive,
  readonly,
  runWithOwner,
  state,
  toReactive,
  type Owner,
} from '../src/runtime/index'

function inRoot<T>(fn: (root: Owner) => T): T {
  const root = createOwner('root', null)
  return runWithOwner(root, () => fn(root))
}

/** Efeito de usuário que conta execuções; já roda a primeira vez. */
function counter(fn: () => unknown): { runs: number } {
  const c = { runs: 0 }
  inRoot(() =>
    effect(() => {
      c.runs++
      fn()
    }),
  )
  flush()
  return c
}

afterEach(() => {
  flush()
  vi.restoreAllMocks()
})

describe('objetos reativos (P1–P13)', () => {
  test('P1 identidade estável', () => {
    const x = { a: { b: 1 } }
    const p = reactive(x)
    expect(p).not.toBe(x)
    expect(reactive(x)).toBe(p)
    expect(reactive(p)).toBe(p)
    expect(p.a).toBe(p.a)
    expect(isReactive(p)).toBe(true)
    expect(isReactive(p.a)).toBe(true)
    expect(isReactive(x)).toBe(false)
  })

  test('P2 ler o.a.b assina só b', () => {
    const o = reactive({ a: { b: 1, c: 1 } })
    const c = counter(() => o.a.b)
    o.a.c = 2
    flush()
    expect(c.runs).toBe(1)
    o.a.b = 2
    flush()
    expect(c.runs).toBe(2)
  })

  test('P3 atribuir o mesmo valor não roda efeitos', () => {
    const o = reactive({ a: 1, n: { x: 1 } as { x: number } })
    const c = counter(() => (o.a, o.n))
    o.a = 1
    o.n = o.n // proxy lido → raw igual ao guardado
    o.n = raw(o.n)
    flush()
    expect(c.runs).toBe(1)
  })

  test('P4 push: quem itera roda 1 vez; quem lê arr[0] não roda', () => {
    const arr = reactive([1, 2])
    const iter = counter(() => arr.map((x) => x))
    const forOf = counter(() => {
      for (const _ of arr);
    })
    const first = counter(() => arr[0])
    arr.push(3)
    flush()
    expect(iter.runs).toBe(2)
    expect(forOf.runs).toBe(2)
    expect(first.runs).toBe(1)
    expect([...arr]).toEqual([1, 2, 3])
  })

  test('P5 arr[0].done = true: só quem lê arr[0].done roda', () => {
    const arr = reactive([
      { done: false, text: 'a' },
      { done: false, text: 'b' },
    ])
    const list = counter(() => arr.forEach(() => {}))
    const done0 = counter(() => arr[0]!.done)
    const done1 = counter(() => arr[1]!.done)
    const text0 = counter(() => arr[0]!.text)
    arr[0]!.done = true
    flush()
    expect(done0.runs).toBe(2)
    expect(done1.runs).toBe(1)
    expect(text0.runs).toBe(1)
    expect(list.runs).toBe(1)
  })

  test('P6 o.a = { novo } troca a referência (sem reconcile)', () => {
    const o = reactive({ a: { v: 1 } })
    const antigo = o.a
    const c = counter(() => o.a.v)
    const novo = { v: 2 }
    o.a = novo
    flush()
    expect(c.runs).toBe(2)
    expect(antigo.v).toBe(1)
    expect(o.a.v).toBe(2)
    expect(raw(o.a)).toBe(novo) // grava o raw; proxy só na leitura
    expect(raw(o).a).toBe(novo)
    // gravar um proxy guarda o raw dele
    o.a = reactive({ v: 3 })
    expect(isReactive(raw(o).a)).toBe(false)
  })

  test('P7 includes/indexOf/lastIndexOf com raw e com proxy', () => {
    const item = { id: 1 }
    const arr = reactive([item, { id: 2 }])
    const proxyItem = arr[0]!
    expect(arr.includes(item)).toBe(true)
    expect(arr.includes(proxyItem)).toBe(true)
    expect(arr.indexOf(proxyItem)).toBe(0)
    expect(arr.lastIndexOf(item)).toBe(0)
    // array que guarda proxies (ex.: resultado de filter) também encontra o raw
    const filtered = reactive(arr.filter(() => true))
    expect(filtered.includes(item)).toBe(true)
    expect(filtered.indexOf(proxyItem)).toBe(0)
  })

  test('P8 classe, Map, Set, Date, RegExp, Promise, DOM, File e typed array passam intactos', () => {
    class Model {
      x = 1
    }
    const values: object[] = [
      new Model(),
      new Map(),
      new Set(),
      new Date(),
      /x/,
      Promise.resolve(),
      document.createElement('div'),
      new File([], 'f.txt'),
      new Uint8Array(2),
    ]
    for (const v of values) {
      expect(reactive(v)).toBe(v)
      expect(toReactive(v)).toBe(v)
      expect(isReactive(v)).toBe(false)
    }
    const o = reactive({ m: values[0], map: values[1] })
    expect(o.m).toBe(values[0])
    expect(o.map).toBe(values[1])
    expect(toReactive(1)).toBe(1)
    expect(toReactive(null)).toBe(null)
  })

  test('P9 raw(obj) antes de reactive: nunca proxiado; raw(proxy) devolve o alvo', () => {
    const big = raw({ rows: [1, 2, 3] })
    expect(reactive(big)).toBe(big)
    const o = reactive({ big, other: { x: 1 } })
    expect(o.big).toBe(big)
    expect(isReactive(o.big)).toBe(false)
    const target = { y: 1 }
    const p = reactive(target)
    expect(raw(p)).toBe(target)
    expect(raw(1)).toBe(1)
    // state também respeita
    const s = state(raw([1, 2]))
    expect(isReactive(s.get())).toBe(false)
  })

  test('P10 sort()/splice(): 1 flush, $iter notificado', () => {
    const arr = reactive([3, 1, 2])
    const flushes = vi.fn()
    const iter = counter(() => {
      flushes()
      arr.forEach(() => {})
    })
    const idx2 = counter(() => arr[2])
    arr.sort()
    flush()
    expect(iter.runs).toBe(2)
    expect(idx2.runs).toBe(2) // índice afetado (2 → 3)
    expect([...arr]).toEqual([1, 2, 3])
    arr.splice(0, 1, 9, 8)
    flush()
    expect(iter.runs).toBe(3)
    expect([...arr]).toEqual([9, 8, 2, 3])
    // sort sem mudança não notifica
    const same = reactive([1, 2, 3])
    const c = counter(() => same.forEach(() => {}))
    same.sort()
    flush()
    expect(c.runs).toBe(1)
    // comparador recebe proxies; retorno é o proxy
    const objs = reactive([{ n: 2 }, { n: 1 }])
    const first = objs[1]
    expect(objs.sort((a, b) => (expect(isReactive(a)).toBe(true), a.n - b.n))).toBe(objs)
    expect(objs[0]).toBe(first)
  })

  test('P11 dev: escrever em readonly avisa com id e loc; valor não muda', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = state({ a: 1, n: { x: 1 }, list: [1] })
    const m = memo(() => ({ total: s.get().a + 1, n: s.get().n, list: s.get().list }), {
      name: 'derivado',
      loc: 'App.tsx:3:9',
    })
    const v = m.get() as { total: number; n: { x: number }; list: number[] }
    v.total = 99
    expect(v.total).toBe(2)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0]).toContain('derived-mutated')
    expect(spy.mock.calls[0]![0]).toContain('App.tsx:3:9')
    v.n.x = 5 // profundo
    expect(s.peek().n.x).toBe(1)
    v.list.push(2)
    expect(s.peek().list).toEqual([1])
    delete (v as Partial<typeof v>).total
    expect(v.total).toBe(2)
    expect(spy.mock.calls.every((c) => String(c[0]).includes('derived-mutated'))).toBe(true)
    // identidade estável entre leituras
    expect(m.get()).toBe(m.get())
    // store
    spy.mockClear()
    const ro = readonly(reactive({ count: 0 }), 'store-mutated-outside-action', { name: 'cart', loc: 'cart.ts:5:1' })
    ro.count = 1
    expect(ro.count).toBe(0)
    expect(spy.mock.calls[0]![0]).toContain('store-mutated-outside-action')
    expect(spy.mock.calls[0]![0]).toContain('cart.ts:5:1')
  })

  test('P11b readonly de proxy reativo continua rastreando e encontra raw em includes', () => {
    const item = { id: 1 }
    const o = reactive({ a: 1, list: [item] })
    const ro = readonly(o, 'derived-mutated')
    const c = counter(() => ro.a)
    o.a = 2
    flush()
    expect(c.runs).toBe(2)
    expect(ro.list.includes(item)).toBe(true)
    expect(isReactive(ro)).toBe(true)
    expect(raw(ro)).toBe(raw(o))
    expect(JSON.stringify(ro)).toBe(JSON.stringify(raw(o)))
  })

  test('P12 JSON.stringify(proxy) igual ao do raw', () => {
    const data = { a: 1, b: [1, { c: 'x' }], d: null, e: { f: [true] } }
    const p = reactive(data)
    p.b.forEach(() => {})
    expect(JSON.stringify(p)).toBe(JSON.stringify(data))
    expect(Array.isArray(p.b)).toBe(true)
  })

  test('P13 delete o.a notifica a chave e a iteração', () => {
    const o = reactive<{ a?: number; b: number }>({ a: 1, b: 2 })
    const key = counter(() => o.a)
    const keys = counter(() => Object.keys(o))
    const has = counter(() => 'a' in o)
    const other = counter(() => o.b)
    delete o.a
    flush()
    expect(key.runs).toBe(2)
    expect(keys.runs).toBe(2)
    expect(has.runs).toBe(2)
    expect(other.runs).toBe(1)
    expect(o.a).toBe(undefined)
  })
})

describe('objetos reativos: extras', () => {
  test('signal por propriedade só nasce com observador', () => {
    const o = reactive({ a: 1 })
    o.a // fora de efeito: nada assinado
    o.a = 2
    flush()
    const c = counter(() => o.a)
    o.a = 3
    flush()
    expect(c.runs).toBe(2)
  })

  test('chave nova notifica a iteração; chave existente não', () => {
    const o = reactive<Record<string, number>>({ a: 1 })
    const keys = counter(() => Object.keys(o))
    o.a = 2
    flush()
    expect(keys.runs).toBe(1)
    o.b = 1
    flush()
    expect(keys.runs).toBe(2)
  })

  test('arrays: índice novo/trocado notifica $iter e length; arr.length = 0 notifica índices', () => {
    const arr = reactive([{ t: 'a' }, { t: 'b' }])
    const iter = counter(() => arr.map((x) => x.t))
    const len = counter(() => arr.length)
    const i1 = counter(() => arr[1])
    arr[0] = { t: 'z' }
    flush()
    expect(iter.runs).toBe(2)
    expect(len.runs).toBe(1)
    arr[2] = { t: 'c' }
    flush()
    expect(iter.runs).toBe(3)
    expect(len.runs).toBe(2)
    arr.length = 0
    flush()
    expect(iter.runs).toBe(4)
    expect(len.runs).toBe(3)
    expect(i1.runs).toBe(2)
  })

  test('mutadores: elementos guardados raw; retornos como proxy; pop notifica o índice removido', () => {
    const a = { id: 1 }
    const arr = reactive<{ id: number }[]>([])
    arr.push(reactive(a))
    expect(raw(arr)[0]).toBe(a)
    const last = counter(() => arr[0])
    expect(arr.pop()).toBe(reactive(a))
    flush()
    expect(last.runs).toBe(2)
    arr.unshift(a, { id: 2 })
    expect(arr.splice(0, 1)[0]).toBe(reactive(a))
    expect(arr.length).toBe(1)
  })

  test('mutador dentro de efeito não assina o array', () => {
    const arr = reactive<number[]>([])
    const src = state(0)
    const c = counter(() => {
      src.get()
      arr.push(1)
    })
    arr.push(2)
    flush()
    expect(c.runs).toBe(1)
  })

  test('métodos de iteração entregam proxies e assinam uma vez', () => {
    const item = { done: false }
    const arr = reactive([item])
    expect(arr.find(() => true)).toBe(reactive(item))
    expect(arr.filter(() => true)[0]).toBe(reactive(item))
    expect(arr.slice()[0]).toBe(reactive(item))
    expect(arr.at(0)).toBe(reactive(item))
    expect(arr.reduce((acc: unknown, x) => (isReactive(x) ? acc : false), true)).toBe(true)
    expect([...arr.entries()][0]![1]).toBe(reactive(item))
    const c = counter(() => arr.filter((x) => x.done).length)
    arr[0]!.done = true
    flush()
    expect(c.runs).toBe(2)
  })

  test('getters em POJO rastreiam pelo proxy', () => {
    const o = reactive({
      a: 1,
      get double() {
        return this.a * 2
      },
    })
    let seen = 0
    const c = counter(() => (seen = o.double))
    o.a = 5
    flush()
    expect(c.runs).toBe(2)
    expect(seen).toBe(10)
  })

  test('objeto congelado não quebra invariantes do Proxy', () => {
    const inner = { x: 1 }
    const o = reactive(Object.freeze({ inner }))
    expect(o.inner).toBe(inner)
  })
})

describe('state() com objetos reativos', () => {
  test('valor inicial e set passam por toReactive', () => {
    const initial = { items: [] as { t: string }[] }
    const s = state(initial)
    expect(isReactive(s.get())).toBe(true)
    expect(raw(s.get())).toBe(initial)
    const next = { items: [{ t: 'a' }] }
    s.set(next)
    expect(isReactive(s.get())).toBe(true)
    expect(raw(s.get())).toBe(next)
  })

  test('set com o raw ou o proxy atual é no-op', () => {
    const initial = { a: 1 }
    const s = state(initial)
    const c = counter(() => s.get())
    s.set(initial)
    s.set(s.peek())
    flush()
    expect(c.runs).toBe(1)
  })

  test('mutação profunda roda só quem lê a propriedade; reatribuição roda quem lê o state', () => {
    const s = state({ todos: [{ text: 'a', done: false }] })
    const list = counter(() => s.get().todos.map((t) => t.text))
    const done = counter(() => s.get().todos[0]?.done)
    s.get().todos.push({ text: 'b', done: false })
    flush()
    expect(list.runs).toBe(2)
    expect(done.runs).toBe(1)
    s.get().todos[0]!.done = true
    flush()
    expect(list.runs).toBe(2)
    expect(done.runs).toBe(2)
    s.set({ todos: [] })
    flush()
    expect(list.runs).toBe(3)
    expect(done.runs).toBe(3)
  })

  test('memo sobre state: igualdade rasa e readonly em dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const s = state({ a: 1, b: 2 })
    const m = memo(() => [s.get().a, s.get().b])
    const c = counter(() => m.get())
    s.get().a = 1
    s.get().b = 2
    flush()
    expect(c.runs).toBe(1)
    const v = m.get()
    v[0] = 5
    expect(m.get()[0]).toBe(1)
    expect(spy).toHaveBeenCalled()
  })
})
