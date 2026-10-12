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
import { effect, flush, memo, observerCount, selector, selectorSubs, signal, state } from '../src/runtime/reactive'
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
          insert(el, () => item().t, null)
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
          insert(el, () => `${item().id}${index()}`, null)
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
          insert(el, () => item().t, null)
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

  test('F8 list: chave padrão id preserva nós e os bindings mostram os dados novos (D58)', () => {
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
          insert(el, () => item().t, null)
          return el
        },
      ),
    )
    const before = Array.from(ul.childNodes)
    const texts = before.map((n) => n.firstChild)
    const records = observe(ul)
    items.set([
      { id: 1, t: 'a' },
      { id: 2, t: 'B' },
    ])
    flush()
    expect(renders).toBe(2)
    expect(Array.from(ul.childNodes)).toEqual(before)
    expect(ul.textContent).toBe('aB')
    // Só o texto da linha 2 muda (mesmo Text); a linha 1 recebeu objeto novo com o mesmo `t`: nenhuma escrita.
    const recs = records()
    expect(recs).toHaveLength(1)
    expect(recs[0]!.type).toBe('characterData')
    expect(recs[0]!.target).toBe(texts[1])
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
          onCleanup(() => disposed.push(v()))
          const el = li()
          el.textContent = v()
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
          insert(el, () => (s.row as ((i: unknown) => Rendered) | undefined)?.(i()), null)
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
            provide(ctx, () => 'tema')
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
        return [component(Child, { n: 'a' }), branches([[() => show.get(), () => component(Child, { n: 'b' })]])]
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

describe('list: reconciliação mínima (LIS) e fast paths', () => {
  /** Lista de `{ id }` renderizada em `<ul>` (marker null); devolve o estado, o `ul` e o log de cleanups. */
  function mountIds(ids: number[], opts: { index?: boolean } = {}) {
    const items = state(ids.map((id) => ({ id })))
    const ul = document.createElement('ul')
    const cleaned: number[] = []
    const root = inRoot((root) => {
      list(
        ul,
        null,
        () => items.get(),
        (item, index) => {
          onCleanup(() => cleaned.push(item().id))
          const el = li()
          if (opts.index) insert(el, () => `${item().id}:${index()}`, null)
          else el.textContent = String(item().id)
          return el
        },
      )
      return root
    })
    return { items, ul, cleaned, root }
  }

  const order = (ul: Element) => Array.from(ul.childNodes, (n) => n.textContent)
  const added = (recs: MutationRecord[]) =>
    recs.filter((r) => r.type === 'childList').flatMap((r) => Array.from(r.addedNodes))
  /** Registra as escritas em `el.textContent` (fast path de clear). */
  function spyTextContent(el: Node): string[] {
    const writes: string[] = []
    let proto = Object.getPrototypeOf(el)
    while (!Object.getOwnPropertyDescriptor(proto, 'textContent')) proto = Object.getPrototypeOf(proto)
    const desc = Object.getOwnPropertyDescriptor(proto, 'textContent')!
    Object.defineProperty(el, 'textContent', {
      configurable: true,
      get: () => desc.get!.call(el),
      set: (v: string) => {
        writes.push(v)
        desc.set!.call(el, v)
      },
    })
    return writes
  }

  test('swap de 2 linhas move exatamente 2 nós (mesmas referências)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => i)
    const { items, ul } = mountIds(ids)
    const before = Array.from(ul.childNodes)
    const records = observe(ul)
    const arr = items.get()
    const a = arr[1]!
    arr[1] = arr[18]!
    arr[18] = a
    flush()
    const recs = records()
    expect(added(recs)).toHaveLength(2)
    expect(new Set(added(recs))).toEqual(new Set([before[1], before[18]]))
    const expected = [...before]
    ;[expected[1], expected[18]] = [expected[18]!, expected[1]!]
    expect(Array.from(ul.childNodes)).toEqual(expected)
  })

  test('swap atualiza index() só das linhas trocadas', () => {
    const { items, ul } = mountIds([0, 1, 2, 3, 4, 5], { index: true })
    const arr = items.get()
    const a = arr[1]!
    arr[1] = arr[4]!
    arr[4] = a
    flush()
    expect(order(ul)).toEqual(['0:0', '4:1', '2:2', '3:3', '1:4', '5:5'])
  })

  test('reverse: n - 1 nós movidos, nenhum criado nem removido', () => {
    const ids = Array.from({ length: 10 }, (_, i) => i)
    const { items, ul, cleaned } = mountIds(ids, { index: true })
    const before = Array.from(ul.childNodes)
    const records = observe(ul)
    items.get().reverse()
    flush()
    const recs = records()
    expect(added(recs)).toHaveLength(9)
    expect(Array.from(ul.childNodes)).toEqual([...before].reverse())
    expect(order(ul)).toEqual(ids.map((id, i) => `${9 - id}:${i}`))
    expect(cleaned).toEqual([])
  })

  test('rotação: último → primeiro e primeiro → último movem 1 nó cada', () => {
    const ids = Array.from({ length: 8 }, (_, i) => i)
    const { items, ul } = mountIds(ids)
    const records = observe(ul)
    const last = items.get().pop()!
    items.get().unshift(last)
    flush()
    expect(added(records())).toHaveLength(1)
    expect(order(ul)).toEqual(['7', '0', '1', '2', '3', '4', '5', '6'])
    const first = items.get().shift()!
    items.get().push(first)
    flush()
    expect(added(records())).toHaveLength(1)
    expect(order(ul)).toEqual(ids.map(String))
  })

  test('embaralhar com inserções e remoções: DOM final correto, nós mantidos reaproveitados', () => {
    const { items, ul, cleaned } = mountIds([1, 2, 3, 4, 5, 6, 7, 8])
    const nodeOf = new Map(Array.from(ul.childNodes, (n) => [n.textContent, n]))
    items.set([8, 3, 10, 1, 6, 11, 2].map((id) => ({ id })))
    flush()
    expect(order(ul)).toEqual(['8', '3', '10', '1', '6', '11', '2'])
    for (const k of ['8', '3', '1', '6', '2']) expect(Array.from(ul.childNodes)).toContain(nodeOf.get(k))
    expect(cleaned.sort()).toEqual([4, 5, 7])
  })

  test('aleatório (semente fixa): ordem, identidade dos nós mantidos e index() corretos', () => {
    let seed = 42
    const rand = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n
    let nextId = 0
    const { items, ul, cleaned } = mountIds(
      Array.from({ length: 12 }, () => nextId++),
      { index: true },
    )
    for (let round = 0; round < 200; round++) {
      const nodeOf = new Map(Array.from(ul.childNodes, (n) => [n.textContent!.split(':')[0], n]))
      const ids = items.get().map((x) => x.id)
      const next = ids.filter(() => rand(5) !== 0)
      for (let i = next.length - 1; i > 0; i--) {
        if (rand(3) === 0) {
          const j = rand(i + 1)
          ;[next[i], next[j]] = [next[j]!, next[i]!]
        }
      }
      for (let k = rand(4); k > 0; k--) next.splice(rand(next.length + 1), 0, nextId++)
      cleaned.length = 0
      items.set(next.map((id) => ({ id })))
      flush()
      expect(order(ul)).toEqual(next.map((id, i) => `${id}:${i}`))
      for (const id of next)
        if (nodeOf.has(String(id))) expect(ul.childNodes[next.indexOf(id)]).toBe(nodeOf.get(String(id)))
      expect(cleaned.sort((a, b) => a - b)).toEqual(ids.filter((id) => !next.includes(id)).sort((a, b) => a - b))
    }
  })

  test('clear com a lista como único conteúdo: textContent, owners descartados, cleanups rodam', () => {
    const sel = signal(0)
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const ul = document.createElement('ul')
    const cleaned: number[] = []
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item) => {
          onCleanup(() => cleaned.push(item().id))
          const el = li()
          effect(() => void el.classList.toggle('on', sel.get() === item().id), { kind: 'render' })
          return el
        },
      ),
    )
    expect(observerCount(sel)).toBe(3)
    const cleared = spyTextContent(ul)
    items.set([])
    flush()
    expect(cleared).toEqual([''])
    expect(ul.childNodes).toHaveLength(0)
    expect(cleaned).toEqual([1, 2, 3])
    expect(observerCount(sel)).toBe(0)
    // a lista continua funcionando depois do clear
    items.set([{ id: 4 }])
    flush()
    expect(ul.textContent).toBe('')
    expect(ul.childNodes).toHaveLength(1)
    expect(observerCount(sel)).toBe(1)
  })

  test('replace (todas as chaves novas): remoção em lote, cleanups rodam, nós novos no lugar', () => {
    const { items, ul, cleaned } = mountIds([1, 2, 3])
    const old = Array.from(ul.childNodes)
    const cleared = spyTextContent(ul)
    items.set([{ id: 4 }, { id: 5 }])
    flush()
    expect(cleared).toEqual([''])
    expect(cleaned).toEqual([1, 2, 3])
    expect(order(ul)).toEqual(['4', '5'])
    for (const n of old) expect(n.parentNode).toBeNull()
  })

  test('clear com outro conteúdo no parent (marker): remove só as linhas', () => {
    const items = state([{ id: 1 }, { id: 2 }])
    const ul = document.createElement('ul')
    const head = ul.appendChild(document.createElement('li'))
    head.textContent = 'head'
    const marker = ul.appendChild(document.createComment(''))
    const tail = ul.appendChild(document.createElement('li'))
    tail.textContent = 'tail'
    const cleaned: number[] = []
    inRoot(() =>
      list(
        ul,
        marker,
        () => items.get(),
        (item) => {
          onCleanup(() => cleaned.push(item().id))
          const el = li()
          el.textContent = String(item().id)
          return el
        },
      ),
    )
    expect(ul.textContent).toBe('head12tail')
    const cleared = spyTextContent(ul)
    items.set([])
    flush()
    expect(Array.from(ul.childNodes)).toEqual([head, marker, tail])
    expect(cleared).toEqual([])
    expect(cleaned).toEqual([1, 2])
  })

  test('chaves duplicadas: aviso, sufixo estável e linhas preservadas ao reordenar', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const a = { id: 1, t: 'a' }
    const b = { id: 1, t: 'b' }
    const c = { id: 2, t: 'c' }
    const items = signal([a, b, c])
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
          el.textContent = item().t
          return el
        },
      ),
    )
    expect(ul.textContent).toBe('abc')
    expect(warn).toHaveBeenCalled()
    const [na, nb, nc] = Array.from(ul.childNodes)
    items.set([c, a, b])
    flush()
    expect(renders).toBe(3)
    // 1ª ocorrência de id 1 continua sendo o nó de `a`, a 2ª o de `b` (chave sintética estável)
    expect(Array.from(ul.childNodes)).toEqual([nc, na, nb])
  })

  test('index() lido sem rastrear não cria signal; lido num binding acompanha moves', () => {
    const items = state([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const ul = document.createElement('ul')
    const atSetup: number[] = []
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item, index) => {
          atSetup.push(index())
          const el = li()
          if (item().id === 'c') insert(el, () => index(), null)
          return el
        },
      ),
    )
    expect(atSetup).toEqual([0, 1, 2])
    expect(ul.textContent).toBe('2')
    items.get().shift()
    flush()
    expect(ul.textContent).toBe('1')
  })
})

describe('list: item lazy (D58), selector (D63), pai do marker (D64)', () => {
  test('item() fora de rastreamento lê o valor atual; mesma referência não notifica', () => {
    const a = { id: 1, t: 'a' }
    const items = signal([a])
    const ul = document.createElement('ul')
    let read: (() => { id: number; t: string }) | null = null
    let runs = 0
    inRoot(() =>
      list(
        ul,
        null,
        () => items.get(),
        (item) => {
          read = item
          const el = li()
          effect(
            () => {
              runs++
              el.textContent = item().t
            },
            { kind: 'render' },
          )
          return el
        },
      ),
    )
    expect(runs).toBe(1)
    items.set([a]) // mesma referência no array novo: Object.is → nenhum binding roda
    flush()
    expect(runs).toBe(1)
    const a2 = { id: 1, t: 'z' }
    items.set([a2])
    flush()
    expect(runs).toBe(2)
    expect(read!()).toBe(a2)
    expect(ul.textContent).toBe('z')
  })

  test('F17 selector: mudar a seleção roda só os efeitos das linhas antiga e nova (1000 linhas)', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }))
    const selected = signal<number | null>(null)
    const ul = document.createElement('ul')
    let runs = 0
    let isSelected!: (v: number | null) => boolean
    inRoot(() => {
      isSelected = selector(() => selected.get())
      list(
        ul,
        null,
        () => rows,
        (item) => {
          const el = li()
          effect(
            () => {
              runs++
              el.className = isSelected(item().id) ? 'danger' : ''
            },
            { kind: 'render' },
          )
          return el
        },
      )
    })
    const events = installDevtools()
    const runsOf = () => (events.find((e) => e.type === 'flush:end') as { effects: number } | undefined)?.effects
    runs = 0
    selected.set(10)
    flush()
    expect(runs).toBe(1) // nada estava selecionado: só a linha nova
    expect(runsOf()).toBe(1)
    expect(ul.children[10]!.className).toBe('danger')
    events.length = 0
    runs = 0
    selected.set(500)
    flush()
    expect(runs).toBe(2)
    expect(runsOf()).toBe(2)
    expect(ul.children[10]!.className).toBe('')
    expect(ul.children[500]!.className).toBe('danger')
    expect(Array.from(ul.children).filter((c) => c.className === 'danger')).toHaveLength(1)
    // fora de rastreamento: só responde, não assina
    expect(isSelected(500)).toBe(true)
    expect(isSelected(10)).toBe(false)
  })

  test('selector: dispose das linhas remove os observadores do mapa; dispose do owner para de vigiar', () => {
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
    const selected = signal(1)
    const ul = document.createElement('ul')
    let isSelected!: (v: number) => boolean
    const root = inRoot((root) => {
      isSelected = selector(() => selected.get())
      list(
        ul,
        null,
        () => items.get(),
        (item) => {
          const el = li()
          effect(() => void el.classList.toggle('on', isSelected(item().id)), { kind: 'render' })
          return el
        },
      )
      return root
    })
    const subs = selectorSubs!.get(isSelected)!
    expect([...subs.keys()].sort()).toEqual([1, 2, 3])
    items.set([{ id: 3 }])
    flush()
    expect([...subs.keys()]).toEqual([3])
    expect(observerCount(selected)).toBe(1) // o vigia do selector
    dispose(root)
    expect(subs.size).toBe(0)
    expect(observerCount(selected)).toBe(0)
  })

  test('selector: leitura logo após o set (antes do flush) já vê a seleção nova', () => {
    const selected = signal('a')
    const isSelected = inRoot(() => selector(() => selected.get()))
    selected.set('b')
    expect(isSelected('b')).toBe(true)
    expect(isSelected('a')).toBe(false)
  })

  test('selector: equals próprio notifica as chaves cuja resposta mudou', () => {
    const selected = signal({ id: 1 })
    const ul = document.createElement('ul')
    const runs: number[] = []
    inRoot(() => {
      const isSelected = selector(
        () => selected.get(),
        (a, b) => a.id === b.id,
      )
      list(
        ul,
        null,
        () => [{ id: 1 }, { id: 2 }, { id: 3 }],
        (item) => {
          const el = li()
          effect(
            () => {
              runs.push(item().id)
              el.className = isSelected(item()) ? 'on' : ''
            },
            { kind: 'render' },
          )
          return el
        },
      )
    })
    runs.length = 0
    selected.set({ id: 1 }) // objeto novo, igual por `equals`: nada
    flush()
    expect(runs).toEqual([])
    selected.set({ id: 3 })
    flush()
    expect(runs.sort()).toEqual([1, 3])
    expect(Array.from(ul.children, (c) => c.className)).toEqual(['', '', 'on'])
  })

  test('F18 list(null, marker): ancorada num fragmento que depois é inserido noutro pai', () => {
    const items = state([
      { id: 1, t: 'a' },
      { id: 2, t: 'b' },
    ])
    const frag = document.createDocumentFragment()
    const marker = frag.appendChild(document.createComment(''))
    inRoot(() =>
      list(
        null,
        marker,
        () => items.get(),
        (item) => {
          const el = li()
          // conteúdo dinâmico na linha (intervalo com marcador próprio) também segue o pai
          return [el, () => item().t]
        },
      ),
    )
    expect(frag.textContent).toBe('ab')
    const div = document.createElement('div')
    const head = div.appendChild(document.createElement('p'))
    div.appendChild(frag)
    const tail = div.appendChild(document.createElement('p'))
    expect(frag.childNodes).toHaveLength(0)
    items.get().push({ id: 3, t: 'c' })
    items.get()[0]!.t = 'A'
    flush()
    expect(div.textContent).toBe('Abc')
    items.set([items.get()[2]!, items.get()[0]!])
    flush()
    expect(div.textContent).toBe('cA')
    expect(div.firstChild).toBe(head)
    expect(div.lastChild).toBe(tail)
    expect(marker.parentNode).toBe(div)
    // esvaziar com parent null nunca usa `textContent = ''` (o pai tem outros nós)
    items.set([])
    flush()
    expect(Array.from(div.childNodes)).toEqual([head, marker, tail])
  })
})
