import { afterEach, describe, expect, test, vi } from 'vitest'
import { insert, listen, template } from '../src/runtime/dom'
import { branches, component, type Rendered } from '../src/runtime/flow'
import { __hmrComponents, __hmrResetRegistry } from '../src/runtime/hmr'
import { onCleanup } from '../src/runtime/owner'
import { createContext, provide, useContext } from '../src/runtime/props'
import { flush, signal, state } from '../src/runtime/reactive'
import { createRoot } from '../src/runtime/root'
import { __hmrStores, createStore } from '../src/store'

afterEach(() => {
  __hmrResetRegistry()
  vi.restoreAllMocks()
})

const FILE = '/app/src/Counter.tsx'

/** Componente como o compilador emite com `hmr`: `let count = init` → `signal(init, { name, loc, hash })`. */
function makeCounter(label: string, init = 0, hash = 'h0') {
  const t = template('<button><!></button>')
  return function Counter(props: { step: number }): Rendered {
    const count = signal(init, { name: 'count', loc: 'Counter.tsx:2:7', hash })
    const el = t()
    insert(el, () => `${label} ${count.get()}`, el.firstChild)
    listen(el, 'click', () => count.set(count.get() + props.step))
    return el
  }
}

/** `<div><b/>{<Counter/>}<i/></div>` dentro de um root. */
function mountApp(Counter: (p: { step: number }) => Rendered) {
  const target = document.createElement('div')
  const t = template('<div><b>antes</b><!><i>depois</i></div>')
  const unmount = createRoot(target, () => {
    const el = t()
    insert(el, component(Counter, { step: 5 }, { name: 'Counter' }), el.firstChild!.nextSibling)
    return el
  })
  return { target, unmount }
}

describe('HMR: registro de componentes', () => {
  test('remontar troca o DOM no lugar e mantém os vizinhos', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const v1 = makeCounter('v1')
    __hmrComponents(FILE, { Counter: v1 })
    const { target } = mountApp(v1)
    const b = target.querySelector('b')!
    const i = target.querySelector('i')!
    expect(target.textContent).toBe('antesv1 0depois')

    __hmrComponents(FILE, { Counter: makeCounter('v2') })
    expect(target.textContent).toBe('antesv2 0depois')
    // vizinhos são os mesmos nós, na mesma ordem
    expect(target.querySelector('b')).toBe(b)
    expect(target.querySelector('i')).toBe(i)
    expect(target.firstChild!.childNodes[0]).toBe(b)
    expect(target.querySelectorAll('button')).toHaveLength(1)
    // o componente novo é interativo
    target.querySelector('button')!.click()
    flush()
    expect(target.textContent).toBe('antesv2 5depois')
  })

  test('descarta o owner antigo (cleanups rodam) e componente não registrado segue o caminho normal', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const cleanups: string[] = []
    const make = (v: string) =>
      function Comp(): Rendered {
        onCleanup(() => cleanups.push(v))
        return document.createTextNode(v)
      }
    const v1 = make('a')
    __hmrComponents(FILE, { Comp: v1 })
    const target = document.createElement('div')
    const unmount = createRoot(target, () => component(v1, {}))
    __hmrComponents(FILE, { Comp: make('b') })
    expect(cleanups).toEqual(['a'])
    expect(target.textContent).toBe('b')
    // função antiga (importador não reexecutado) monta a implementação nova
    const other = document.createElement('div')
    createRoot(other, () => component(v1, {}))
    expect(other.textContent).toBe('b')
    unmount()
    expect(cleanups).toEqual(['a', 'b'])
    expect(target.textContent).toBe('')

    // não registrado: devolve os nós direto
    const plain = component(() => document.createTextNode('x'), {})
    expect(typeof plain).toBe('object')
    expect((plain as Node).nodeType).toBe(3)
  })

  test('preserveState: preserva se o hash do inicializador é igual, reseta se mudou, loga no console', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const v1 = makeCounter('v1', 0, 'h0')
    __hmrComponents(FILE, { Counter: v1 })
    const { target } = mountApp(v1)
    const click = () => {
      target.querySelector('button')!.click()
      flush()
    }
    click()
    expect(target.textContent).toBe('antesv1 5depois')

    // sem a flag: reseta
    __hmrComponents(FILE, { Counter: makeCounter('v2', 0, 'h0') })
    expect(target.textContent).toBe('antesv2 0depois')
    expect(info).toHaveBeenLastCalledWith('[jotastic] HMR Counter (1×): estado local resetado')

    click()
    // com a flag e mesmo hash: preserva
    __hmrComponents(FILE, { Counter: makeCounter('v3', 0, 'h0') }, { preserveState: true })
    expect(target.textContent).toBe('antesv3 5depois')
    expect(info).toHaveBeenLastCalledWith('[jotastic] HMR Counter (1×): preservado: count; resetado: —')

    // inicializador mudou (hash diferente): reseta para o novo inicializador
    __hmrComponents(FILE, { Counter: makeCounter('v4', 100, 'h1') }, { preserveState: true })
    expect(target.textContent).toBe('antesv4 100depois')
    expect(info).toHaveBeenLastCalledWith('[jotastic] HMR Counter (1×): preservado: —; resetado: count')

    click()
    // @refresh reset força reset mesmo com a flag
    __hmrComponents(FILE, { Counter: makeCounter('v5', 100, 'h1') }, { preserveState: true, reset: true })
    expect(target.textContent).toBe('antesv5 100depois')
    expect(info).toHaveBeenLastCalledWith('[jotastic] HMR Counter (1×): estado local resetado (@refresh reset)')
  })

  test('state (objeto) preservado mantém o objeto reativo; let sem hash nunca é preservado', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const make = (v: string) =>
      function Todo(): Rendered {
        const todo = state({ text: 'a' }, { name: 'todo', hash: 'x' })
        const n = signal(0, { name: 'n' })
        const el = document.createElement('p')
        insert(el, () => `${v}:${todo.get().text}:${n.get()}`, null)
        listen(el, 'click', () => {
          todo.get().text = 'b'
          n.set(1)
        })
        return el
      }
    const v1 = make('1')
    __hmrComponents(FILE, { Todo: v1 })
    const target = document.createElement('div')
    createRoot(target, () => component(v1, {}))
    target.querySelector('p')!.click()
    flush()
    expect(target.textContent).toBe('1:b:1')
    __hmrComponents(FILE, { Todo: make('2') }, { preserveState: true })
    expect(target.textContent).toBe('2:b:0')
    target.querySelector('p')!.click()
    flush()
    expect(target.textContent).toBe('2:b:1')
  })

  test('várias instâncias, contexto do pai e instância dentro de branch descartada', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const Ctx = createContext('padrão')
    const make = (v: string) =>
      function Item(props: { id: number }): Rendered {
        return document.createTextNode(`${v}${props.id}${useContext(Ctx)};`)
      }
    const v1 = make('a')
    __hmrComponents(FILE, { Item: v1 })
    const show = signal(true)
    const target = document.createElement('div')
    createRoot(target, () => {
      provide(Ctx, 'ctx')
      return [
        component(v1, { id: 1 }),
        branches([[() => show.get(), () => component(v1, { id: 2 })]]),
        component(v1, { id: 3 }),
      ]
    })
    expect(target.textContent).toBe('a1ctx;a2ctx;a3ctx;')
    show.set(false)
    flush()
    expect(target.textContent).toBe('a1ctx;a3ctx;')
    __hmrComponents(FILE, { Item: make('b') })
    expect(target.textContent).toBe('b1ctx;b3ctx;')
    show.set(true)
    flush()
    expect(target.textContent).toBe('b1ctx;b2ctx;b3ctx;')
  })

  test('componente pai e filho do mesmo arquivo: remonta de fora para dentro', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    let childRuns = 0
    const makeChild = (v: string) =>
      function Child(): Rendered {
        childRuns++
        return document.createTextNode(v)
      }
    const makeParent = (Child: () => Rendered, v: string) =>
      function Parent(): Rendered {
        const el = document.createElement('section')
        el.append(v)
        insert(el, component(Child, {}), null)
        return el
      }
    const c1 = makeChild('c1')
    const p1 = makeParent(c1, 'p1')
    __hmrComponents(FILE, { Parent: p1, Child: c1 })
    const target = document.createElement('div')
    createRoot(target, () => component(p1, {}))
    expect(target.textContent).toBe('p1c1')
    childRuns = 0
    const c2 = makeChild('c2')
    __hmrComponents(FILE, { Parent: makeParent(c2, 'p2'), Child: c2 })
    expect(target.textContent).toBe('p2c2')
    // o Child antigo foi descartado junto com o Parent antigo: não remonta à toa
    expect(childRuns).toBe(1)
  })

  test('mesma função registrada de novo não remonta', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const v1 = makeCounter('v1')
    __hmrComponents(FILE, { Counter: v1 })
    const { target } = mountApp(v1)
    const btn = target.querySelector('button')
    __hmrComponents(FILE, { Counter: v1 })
    expect(target.querySelector('button')).toBe(btn)
    expect(info).not.toHaveBeenCalled()
  })
})

describe('HMR: stores', () => {
  test('store novo herda o estado do antigo de mesmo nome (chaves que ainda existem)', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const data: Record<string, unknown> = {}
    const make = (extra: Record<string, unknown> = {}) =>
      createStore<{ n: number; items: string[]; inc(): void; readonly double: number }>((set, get) => ({
        n: 0,
        items: [],
        ...extra,
        inc: () => set({ n: get().n + 1, items: [...get().items, 'x'] }),
        get double() {
          return get().n * 2
        },
      }))
    const a = make()
    __hmrStores(data, { cart: a })
    a.inc()
    a.inc()
    const b = make({ added: true })
    __hmrStores(data, { cart: b })
    expect(b.n).toBe(2)
    expect(b.double).toBe(4)
    expect([...b.items]).toEqual(['x', 'x'])
    expect((b as unknown as { added: boolean }).added).toBe(true)
    expect(info).toHaveBeenCalledWith('[jotastic] HMR stores preservados: cart')
    // cópia, não o mesmo objeto: mexer no antigo não afeta o novo
    a.inc()
    expect(b.items).toHaveLength(2)

    // @refresh reset
    const c = make()
    __hmrStores(data, { cart: c }, true)
    expect(c.n).toBe(0)
    expect(data.jotasticStores).toEqual({ cart: c })
  })
})
