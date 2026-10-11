import { afterEach, describe, expect, test, vi } from 'vitest'
import type { DevtoolsEvent, DevtoolsHook } from '../src/runtime/devtools'
import { insert, template } from '../src/runtime/dom'
import {
  branches,
  children,
  component,
  keyed,
  list,
  portal,
  slots,
  SLOTS,
  type Rendered,
  type Slots,
} from '../src/runtime/flow'
import {
  createOwner,
  dispose,
  onCleanup,
  runWithOwner,
  setOnError,
  type ErrorInfo,
  type Owner,
} from '../src/runtime/owner'
import { createContext, provide, useContext } from '../src/runtime/props'
import { effect, flush, memo, observerCount, signal, state } from '../src/runtime/reactive'
import { createRoot } from '../src/runtime/root'

/** Roda `fn` dentro de um owner raiz. */
function inRoot<T>(fn: (root: Owner) => T): T {
  const root = createOwner('root', null)
  return runWithOwner(root, () => fn(root))
}

/** Observa `node` e devolve uma função que lê (e consome) as mutações registradas até agora. */
function observe(node: Node): () => MutationRecord[] {
  const mo = new MutationObserver(() => {})
  mo.observe(node, { subtree: true, childList: true, characterData: true, attributes: true })
  return () => mo.takeRecords()
}

/** Instala um hook de devtools que guarda os eventos. */
function installDevtools(): DevtoolsEvent[] {
  const events: DevtoolsEvent[] = []
  const hook: DevtoolsHook = { emit: (e) => events.push(e), registry: { owners: new Map() } }
  ;(globalThis as { __JOTASTIC_DEVTOOLS__?: DevtoolsHook }).__JOTASTIC_DEVTOOLS__ = hook
  return events
}

const li = template('<li></li>')

afterEach(() => {
  flush()
  delete (globalThis as { __JOTASTIC_DEVTOOLS__?: unknown }).__JOTASTIC_DEVTOOLS__
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('fluxo (F1–F16)', () => {
  test('F1 branches alternando N vezes: N instâncias; assinantes voltam a 0', () => {
    const open = signal(true)
    const label = signal('x')
    let created = 0
    let disposed = 0
    const div = document.createElement('div')
    const root = inRoot((root) => {
      insert(
        div,
        branches([
          [
            () => open.get(),
            () => {
              created++
              onCleanup(() => disposed++)
              const p = document.createElement('p')
              insert(p, () => label.get(), null)
              return p
            },
          ],
        ]),
        null,
      )
      return root
    })
    expect(div.innerHTML).toBe('<p>x</p>')
    const N = 10
    for (let i = 0; i < N; i++) {
      open.set(false)
      flush()
      expect(observerCount(label)).toBe(0)
      open.set(true)
      flush()
      expect(observerCount(label)).toBe(1)
    }
    expect(created).toBe(N + 1)
    expect(disposed).toBe(N)
    expect(div.innerHTML).toBe('<p>x</p>')
    dispose(root)
    expect(disposed).toBe(N + 1)
    expect(observerCount(label)).toBe(0)
    expect(observerCount(open)).toBe(0)
  })

  test('F2 true → false → true no mesmo tick: 0 mutações no DOM', () => {
    const open = signal(true)
    let created = 0
    const div = document.createElement('div')
    inRoot(() =>
      insert(
        div,
        branches(
          [
            [
              () => open.get(),
              () => {
                created++
                return li()
              },
            ],
          ],
          () => 'fechado',
        ),
        null,
      ),
    )
    const records = observe(div)
    open.set(false)
    open.set(true)
    flush()
    expect(records()).toHaveLength(0)
    expect(created).toBe(1)
  })

  test('F3 condição muda de valor sem mudar de caso: branch não recriado, bindings atualizam', () => {
    const user = signal<{ name: string } | null>({ name: 'A' })
    let created = 0
    const div = document.createElement('div')
    inRoot(() =>
      insert(
        div,
        branches([[() => !user.get(), () => 'login']], () => {
          created++
          const p = document.createElement('p')
          insert(p, () => user.get()!.name, null)
          return p
        }),
        null,
      ),
    )
    const p = div.firstChild
    user.set({ name: 'B' })
    flush()
    expect(created).toBe(1)
    expect(div.firstChild).toBe(p)
    expect(div.textContent).toBe('B')
  })

  test('F4 top-down: user → null descarta a continuação antes do binding rodar', () => {
    const user = signal<{ name: string } | null>({ name: 'Ana' })
    const onError = vi.fn()
    const div = document.createElement('div')
    let nameRuns = 0
    createRoot(
      div,
      () =>
        branches([[() => !user.get(), () => 'carregando']], () => {
          // continuação: lê user.name sem guarda (narrowing do TS)
          const name = memo(() => {
            nameRuns++
            return user.get()!.name.toUpperCase()
          })
          const p = document.createElement('p')
          insert(p, () => name.get(), null)
          return p
        }),
      { onError },
    )
    expect(div.textContent).toBe('ANA')
    expect(() => {
      user.set(null)
      flush()
    }).not.toThrow()
    expect(onError).not.toHaveBeenCalled()
    expect(nameRuns).toBe(1)
    expect(div.textContent).toBe('carregando')
    user.set({ name: 'Bia' })
    flush()
    expect(div.textContent).toBe('BIA')
  })

  test('F5 list: inserir no início insere 1 nó e preserva os outros', () => {
    const items = state([
      { id: 1, t: 'a' },
      { id: 2, t: 'b' },
      { id: 3, t: 'c' },
    ])
    const ul = document.createElement('ul')
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item) => {
          const el = li()
          insert(el, () => item.t, null)
          return el
        },
      ),
    )
    const before = Array.from(ul.childNodes)
    const records = observe(ul)
    items.get().unshift({ id: 0, t: 'z' })
    flush()
    const recs = records()
    expect(recs).toHaveLength(1)
    expect(recs[0]!.addedNodes).toHaveLength(1)
    expect(recs[0]!.removedNodes).toHaveLength(0)
    expect(ul.textContent).toBe('zabc')
    const after = Array.from(ul.childNodes)
    for (let i = 0; i < 3; i++) expect(after[i + 1]!.isSameNode(before[i]!)).toBe(true)
  })

  test('F6 list: mover item move o mesmo nó e atualiza index()', () => {
    const items = state([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
    const ul = document.createElement('ul')
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item, index) => {
          const el = li()
          insert(el, () => `${item.id}${index()}`, null)
          return el
        },
      ),
    )
    expect(ul.textContent).toBe('a0b1c2d3')
    const [a, b, c, d] = Array.from(ul.childNodes)
    const records = observe(ul)
    const arr = items.get()
    items.set([arr[0]!, arr[2]!, arr[1]!, arr[3]!])
    flush()
    expect(Array.from(ul.childNodes)).toEqual([a, c, b, d])
    // 1 nó movido (remoção + inserção do mesmo nó) + 2 textos de índice
    const childList = records().filter((r) => r.type === 'childList')
    expect(childList.flatMap((r) => Array.from(r.addedNodes))).toEqual([b])
    expect(ul.textContent).toBe('a0c1b2d3')
  })

  test('F7 list: editar 1 campo roda só os bindings daquele item', () => {
    const items = state([
      { id: 1, t: 'a' },
      { id: 2, t: 'b' },
      { id: 3, t: 'c' },
    ])
    const ul = document.createElement('ul')
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item) => {
          const el = li()
          insert(el, () => item.t, null)
          return el
        },
      ),
    )
    const events = installDevtools()
    items.get()[1]!.t = 'B'
    flush()
    const end = events.find((e) => e.type === 'flush:end') as Extract<DevtoolsEvent, { type: 'flush:end' }>
    expect(events.filter((e) => e.type === 'effect:run')).toHaveLength(1)
    expect(end.effects).toBe(1)
    expect(ul.textContent).toBe('aBc')
  })

  test('F8 list: chave padrão id preserva nós ao reatribuir com mesmos ids', () => {
    const items = signal([
      { id: 1, t: 'a' },
      { id: 2, t: 'b' },
    ])
    const ul = document.createElement('ul')
    let renders = 0
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item) => {
          renders++
          const el = li()
          el.textContent = item.t
          return el
        },
      ),
    )
    const before = Array.from(ul.childNodes)
    const records = observe(ul)
    items.set([
      { id: 1, t: 'a' },
      { id: 2, t: 'b' },
    ])
    flush()
    expect(renders).toBe(2)
    expect(records()).toHaveLength(0)
    expect(Array.from(ul.childNodes)).toEqual(before)
  })

  test('F9 list: todos removidos e novos emite list:recreated', () => {
    const events = installDevtools()
    const items = signal([{ id: 1 }, { id: 2 }])
    const ul = document.createElement('ul')
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        () => li(),
        undefined,
        { loc: 'X.tsx:1:1' },
      ),
    )
    expect(events.some((e) => e.type === 'list:recreated')).toBe(false)
    items.set([{ id: 3 }, { id: 4 }, { id: 5 }])
    flush()
    const ev = events.find((e) => e.type === 'list:recreated')
    expect(ev).toMatchObject({ type: 'list:recreated', loc: 'X.tsx:1:1', count: 2 })
    expect(ul.childNodes).toHaveLength(3)
  })

  test('F10 list de primitivos: mudar valor na posição recria só aquela linha', () => {
    const items = signal(['a', 'b', 'c'])
    const ul = document.createElement('ul')
    const disposed: string[] = []
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (v) => {
          onCleanup(() => disposed.push(v))
          const el = li()
          el.textContent = v
          return el
        },
      ),
    )
    const [a, b, c] = Array.from(ul.childNodes)
    items.set(['a', 'x', 'c'])
    flush()
    const now = Array.from(ul.childNodes)
    expect(now[0]).toBe(a)
    expect(now[1]).not.toBe(b)
    expect(now[2]).toBe(c)
    expect(disposed).toEqual(['b'])
    expect(ul.textContent).toBe('axc')
  })

  test('F11 keyed: mudar key recria; mesma key não', () => {
    const user = signal({ id: 1, name: 'a' })
    let created = 0
    const div = document.createElement('div')
    inRoot(() =>
      insert(
        div,
        keyed(
          () => user.get().id,
          () => {
            created++
            const p = document.createElement('p')
            insert(p, () => user.get().name, null)
            return p
          },
        ),
        null,
      ),
    )
    const p = div.firstChild
    user.set({ id: 1, name: 'b' })
    flush()
    expect(created).toBe(1)
    expect(div.firstChild).toBe(p)
    expect(div.textContent).toBe('b')
    user.set({ id: 2, name: 'c' })
    flush()
    expect(created).toBe(2)
    expect(div.firstChild).not.toBe(p)
    expect(div.textContent).toBe('c')
  })

  test('F12 slots: default, nomeado, com parâmetro, condicional reativo', () => {
    const t0 = template('<section><!><div class="body"></div><ul></ul><!></section>')
    const header = template('<header></header>')
    const footer = template('<footer></footer>')

    function Card(props: { children: unknown; items: { id: number; name: string }[] }) {
      const s = slots(props.children)
      const el = t0()
      const m0 = el.firstChild!
      const body = m0.nextSibling!
      const ul = body.nextSibling!
      const m1 = ul.nextSibling!
      insert(
        el,
        branches([
          [
            () => !!s.header,
            () => {
              const h = header()
              insert(h, () => s.header as () => Rendered, null)
              return h
            },
          ],
        ]),
        m0,
      )
      insert(body, () => s.default, null)
      list(
        ul,
        null,
        () => props.items,
        (i) => {
          const el = li()
          insert(el, () => (s.row as ((i: unknown) => Rendered) | undefined)?.(i), null)
          return el
        },
        (i) => i.id,
      )
      insert(
        el,
        branches([
          [
            () => !!s.footer,
            () => {
              const f = footer()
              insert(f, () => s.footer as () => Rendered, null)
              return f
            },
          ],
        ]),
        m1,
      )
      return el
    }

    const admin = signal(false)
    const target = document.createElement('div')
    createRoot(target, () =>
      component(
        Card,
        {
          items: [{ id: 1, name: 'um' }],
          children: {
            [SLOTS]: true,
            default: () => document.createTextNode('corpo'),
            header: () => document.createTextNode('título'),
            row: (item: { name: string }) => {
              const b = document.createElement('b')
              insert(b, () => item.name, null)
              return b
            },
            get footer() {
              return admin.get() ? () => document.createTextNode('excluir') : undefined
            },
          } as unknown as Slots,
        },
        { name: 'Card' },
      ),
    )
    const body = '<div class="body">corpo</div><ul><li><b>um</b></li></ul>'
    expect(target.innerHTML).toBe(`<section><header>título</header><!---->${body}<!----></section>`)
    admin.set(true)
    flush()
    expect(target.innerHTML).toBe(
      `<section><header>título</header><!---->${body}<footer>excluir</footer><!----></section>`,
    )

    // children simples → { default }
    const p = document.createElement('p')
    const s = slots(p)
    expect(s[SLOTS]).toBe(true)
    expect(s.default()).toBe(p)
    expect(slots(undefined).default()).toBe(null)
  })

  test('F13 portal: nós no alvo; contexto e erro seguem a origem; removidos no dispose', () => {
    const ctx = createContext<string>()
    const modal = document.createElement('div')
    document.body.appendChild(modal)
    const onError = vi.fn<(e: unknown, info: ErrorInfo) => void>()
    const target = document.createElement('main')
    let origin: Owner | null = null
    const unmount = createRoot(
      target,
      () =>
        component(
          function App() {
            provide(ctx, 'tema')
            const p = document.createElement('p')
            p.textContent = 'app'
            const r = portal(
              () => modal,
              () => {
                origin = createOwner('component', undefined, { name: 'probe' })
                dispose(origin)
                const b = document.createElement('b')
                b.textContent = useContext(ctx)
                effect(() => {
                  throw new Error('boom')
                })
                return b
              },
            )
            expect(r).toBe(null)
            return p
          },
          {},
          { name: 'App' },
        ),
      { onError },
    )
    expect(target.innerHTML).toBe('<p>app</p>')
    expect(modal.innerHTML).toBe('<b>tema</b><!---->')
    expect(onError).toHaveBeenCalledTimes(1)
    const info = onError.mock.calls[0]![1]
    expect(info.component).toBe('App')
    let o: Owner | null = info.owner
    const kinds: string[] = []
    for (; o; o = o.parent) kinds.push(o.kind)
    expect(kinds).toEqual(['portal', 'component', 'root'])
    unmount()
    expect(modal.innerHTML).toBe('')
  })

  test('F14 children: props.children lido 2× cria nós 1×', () => {
    let created = 0
    const props = {
      get children() {
        created++
        return document.createElement('span')
      },
    }
    const div = document.createElement('div')
    inRoot(() => {
      const c = children(() => props.children)
      const a = document.createElement('a')
      const b = document.createElement('b')
      insert(a, c, null)
      insert(b, () => (c() ? 'tem' : 'não'), null)
      div.append(a, b)
    })
    expect(created).toBe(1)
    expect(div.innerHTML).toBe('<a><span></span></a><b>tem</b>')
  })

  test('F15 owner dispose: cleanups em ordem reversa; filhos antes do pai', () => {
    const log: string[] = []
    const show = signal(true)
    function Child(props: { n: string }) {
      onCleanup(() => log.push(`${props.n}:1`))
      onCleanup(() => log.push(`${props.n}:2`))
      return props.n
    }
    const div = document.createElement('div')
    const unmount = createRoot(div, () =>
      component(function Parent() {
        onCleanup(() => log.push('parent:1'))
        onCleanup(() => log.push('parent:2'))
        // `Rendered` não aceita array misto (mesma lacuna de T-1): cast no teste
        const out = [component(Child, { n: 'a' }), branches([[() => show.get(), () => component(Child, { n: 'b' })]])]
        return out as unknown as Rendered
      }, {}),
    )
    expect(div.textContent).toBe('ab')
    show.set(false)
    flush()
    expect(log).toEqual(['b:2', 'b:1'])
    log.length = 0
    unmount()
    expect(log).toEqual(['a:2', 'a:1', 'parent:2', 'parent:1'])
  })

  test('F16 component com erro no setup: handleError(setup); vizinhos continuam', () => {
    const errors: ErrorInfo[] = []
    const root = createOwner('root', null)
    setOnError(root, (_e, info) => errors.push(info))
    const div = document.createElement('div')
    let cleaned = false
    function Bad(): Rendered {
      onCleanup(() => (cleaned = true))
      throw new Error('setup')
    }
    function Good() {
      return 'ok'
    }
    runWithOwner(root, () => {
      insert(
        div,
        [component(Good, {}), component(Bad, {}, { name: 'Bad', loc: 'B.tsx:1:1' }), component(Good, {})],
        null,
      )
    })
    expect(div.textContent).toBe('okok')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ phase: 'setup', component: 'Bad', loc: 'B.tsx:1:1' })
    expect(errors[0]!.owner.kind).toBe('component')
    expect(cleaned).toBe(true)
  })
})
