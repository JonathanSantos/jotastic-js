import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createOwner,
  dispose,
  effect,
  external,
  flush,
  getOwner,
  inspect,
  on,
  onCleanup,
  onMount,
  runWithOwner,
  signal,
  type ErrorInfo,
  type Owner,
} from '../src/runtime/index'
import { autoDestroy } from '../src/runtime/external'
import { setOnError } from '../src/runtime/owner'

function inRoot<T>(fn: (root: Owner) => T): T {
  const root = createOwner('root', null)
  return runWithOwner(root, () => fn(root))
}

afterEach(() => {
  flush()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('external / on / onMount (E1–E5)', () => {
  test('E1 external(create, update): create 1×, update a cada mudança, destroy no dispose', () => {
    const data = signal(1)
    const calls: string[] = []
    let root!: Owner
    const ext = inRoot((r) => {
      root = r
      return external(
        () => {
          calls.push(`create:${data.get()}`) // untracked: não deve assinar
          return { id: 'chart' }
        },
        (v) => calls.push(`update:${v.id}:${data.get()}`),
        (v) => calls.push(`destroy:${v.id}`),
      )
    })
    expect(calls).toEqual([]) // efeito de usuário: nada antes do flush
    expect(() => ext.get()).toThrow(/ref-before-mount/)
    flush()
    expect(calls).toEqual(['create:1', 'update:chart:1'])
    expect(ext.get()).toEqual({ id: 'chart' })
    const first = ext.get()

    data.set(2)
    flush()
    data.set(3)
    flush()
    expect(calls).toEqual(['create:1', 'update:chart:1', 'update:chart:2', 'update:chart:3'])
    expect(ext.get()).toBe(first)

    dispose(root)
    expect(calls.at(-1)).toBe('destroy:chart')
    expect(calls.filter((c) => c.startsWith('create'))).toHaveLength(1)
    data.set(4)
    flush()
    expect(calls.filter((c) => c.startsWith('update'))).toHaveLength(3)
  })

  test('E2 external(create) com dependência: destroy + create ao mudar', () => {
    const room = signal('a')
    const log: string[] = []
    let root!: Owner
    const seen: string[] = []
    const sock = inRoot((r) => {
      root = r
      const s = external(() => {
        const id = room.get()
        log.push(`create:${id}`)
        return { id, destroy: () => log.push(`destroy:${id}`) }
      })
      effect(() => {
        seen.push(s.get().id)
      })
      return s
    })
    flush()
    expect(log).toEqual(['create:a'])
    expect(seen).toEqual(['a'])

    room.set('b')
    flush()
    expect(log).toEqual(['create:a', 'destroy:a', 'create:b'])
    expect(sock.get().id).toBe('b')
    expect(seen).toEqual(['a', 'b']) // quem lê o external vê a recriação

    dispose(root)
    expect(log).toEqual(['create:a', 'destroy:a', 'create:b', 'destroy:b'])
  })

  test('E3 destruição automática: destroy/dispose/disconnect/unsubscribe; close só em WebSocket etc.', () => {
    for (const m of ['destroy', 'dispose', 'disconnect', 'unsubscribe'] as const) {
      const fn = vi.fn()
      autoDestroy({ [m]: fn, close: vi.fn() })
      expect(fn, m).toHaveBeenCalledTimes(1)
    }
    // ordem de preferência
    const order: string[] = []
    autoDestroy({ unsubscribe: () => order.push('unsubscribe'), destroy: () => order.push('destroy') })
    expect(order).toEqual(['destroy'])
    const sym = (Symbol as { dispose?: symbol }).dispose
    if (sym) {
      const d = vi.fn()
      const destroy = vi.fn()
      autoDestroy({ [sym]: d, destroy })
      expect(d).toHaveBeenCalledTimes(1)
      expect(destroy).not.toHaveBeenCalled()
    }

    // `close`/`abort` num objeto qualquer: nunca chamados
    const panel = { close: vi.fn(), abort: vi.fn(), terminate: vi.fn() }
    autoDestroy(panel)
    expect(panel.close).not.toHaveBeenCalled()
    expect(panel.abort).not.toHaveBeenCalled()
    expect(panel.terminate).not.toHaveBeenCalled()

    // tipos conhecidos
    const ctrl = new AbortController()
    autoDestroy(ctrl)
    expect(ctrl.signal.aborted).toBe(true)
    class FakeWebSocket {
      close = vi.fn()
    }
    vi.stubGlobal('WebSocket', FakeWebSocket)
    try {
      const ws = new FakeWebSocket()
      autoDestroy(ws)
      expect(ws.close).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }

    // via external: terceiro argumento substitui a escolha automática
    const auto = { dispose: vi.fn() }
    const custom = { dispose: vi.fn() }
    const remove = vi.fn()
    const root = inRoot((r) => {
      external(() => auto)
      external(() => custom, undefined, remove)
      return r
    })
    flush()
    dispose(root)
    expect(auto.dispose).toHaveBeenCalledTimes(1)
    expect(custom.dispose).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith(custom)
  })

  test('X-5 valor função é chamado como destroy (subscribe → unsubscribe), na recriação e no dispose', () => {
    const topic = signal('a')
    const log: string[] = []
    const root = inRoot((r) => {
      external(() => {
        const t = topic.get()
        log.push(`subscribe:${t}`)
        return () => log.push(`unsubscribe:${t}`)
      })
      return r
    })
    flush()
    topic.set('b')
    flush()
    dispose(root)
    expect(log).toEqual(['subscribe:a', 'unsubscribe:a', 'subscribe:b', 'unsubscribe:b'])

    const fn = Object.assign(vi.fn(), { destroy: vi.fn() })
    autoDestroy(fn)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.destroy).not.toHaveBeenCalled()
  })

  test('E4 on com alvo lazy: re-liga quando o alvo muda; remove no dispose; alvo undefined → nada', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    const target = signal<EventTarget | undefined>(undefined)
    const hits: string[] = []
    const root = inRoot((r) => {
      on(
        () => target.get(),
        'ping',
        (e) => hits.push((e.currentTarget as HTMLElement) === a ? 'a' : 'b'),
      )
      return r
    })
    flush() // alvo undefined: nada ligado, sem erro
    a.dispatchEvent(new Event('ping'))
    expect(hits).toEqual([])

    target.set(a)
    flush()
    a.dispatchEvent(new Event('ping'))
    expect(hits).toEqual(['a'])

    target.set(b)
    flush()
    a.dispatchEvent(new Event('ping'))
    b.dispatchEvent(new Event('ping'))
    expect(hits).toEqual(['a', 'b'])

    dispose(root)
    b.dispatchEvent(new Event('ping'))
    expect(hits).toEqual(['a', 'b'])
  })

  test('E4b on: handler roda no owner; exceção e Promise rejeitada → handleError(handler)', async () => {
    const el = document.createElement('div')
    const errors: Array<[unknown, ErrorInfo]> = []
    let ownerInHandler: Owner | null = null
    const root = inRoot((r) => {
      setOnError(r, (e, info) => errors.push([e, info]))
      on(
        () => el,
        'boom',
        () => {
          onCleanup(() => {}) // não avisa: há owner
          throw new Error('sync')
        },
      )
      on(
        () => el,
        'async',
        () => Promise.reject(new Error('async')),
      )
      on(
        () => el,
        'who',
        () => {
          ownerInHandler = getOwner()
        },
      )
      return r
    })
    flush()
    el.dispatchEvent(new Event('boom'))
    el.dispatchEvent(new Event('async'))
    el.dispatchEvent(new Event('who'))
    await Promise.resolve()
    await Promise.resolve()
    expect(errors.map(([e, i]) => [(e as Error).message, i.phase])).toEqual([
      ['sync', 'handler'],
      ['async', 'handler'],
    ])
    expect(ownerInHandler).toBe(root)
    dispose(root)
  })

  test('E5 onMount roda 1× depois do DOM, vê refs', () => {
    const count = signal(0)
    const seen: Array<[boolean, number]> = []
    let input!: HTMLInputElement
    const root = inRoot((r) => {
      onMount(() => {
        seen.push([input.isConnected, count.get()]) // leitura untracked
        input.focus()
      })
      // "template" criado e ref atribuído depois da chamada, inserido antes do flush
      input = document.createElement('input')
      document.body.append(input)
      return r
    })
    expect(seen).toEqual([])
    flush()
    expect(seen).toEqual([[true, 0]])
    expect(document.activeElement).toBe(input)
    count.set(1)
    flush()
    expect(seen).toEqual([[true, 0]])
    dispose(root)
  })

  test('inspect loga nome/loc e os valores a cada mudança', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const count = signal(1)
    const root = inRoot((r) => {
      inspect({ name: 'count', loc: 'App.tsx:3' }, () => count.get())
      return r
    })
    flush()
    count.set(2)
    flush()
    expect(log.mock.calls).toEqual([
      ['[jotastic] inspect count (App.tsx:3)', 1],
      ['[jotastic] inspect count (App.tsx:3)', 2],
    ])
    dispose(root)
  })
})
