import { afterEach, describe, expect, test, vi } from 'vitest'
import * as api from '../src/index'
import {
  Boundary,
  createContext,
  external,
  inspect,
  mount,
  on,
  onCleanup,
  onMount,
  pending,
  Portal,
  refresh,
  Slot,
  untrack,
  useContext,
  useSlots,
  watch,
  tick,
  raw,
  abortSignal,
} from '../src/index'
import { resource, type Resource } from '../src/runtime/async'
import { component, SLOTS, type Rendered } from '../src/runtime/flow'
import { effect, memo, signal } from '../src/runtime/reactive'
import { isReactive, reactive } from '../src/runtime/proxy'

/** Cria um `<div id>` no body; removido no afterEach. */
function host(id = 'app'): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)
  return el
}

function p(text: () => string): HTMLElement {
  const el = document.createElement('p')
  el.textContent = text()
  return el
}

/** Componentes públicos tipam `JSX.Element`, mais largo que `Rendered` (pendências T-1/L-7). */
const publicComponent = component as unknown as <P>(Comp: (props: P) => unknown, props: P) => Rendered

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('exports', () => {
  test('todas as funções do contrato existem', () => {
    const names = [
      'mount',
      'watch',
      'on',
      'external',
      'onMount',
      'onCleanup',
      'untrack',
      'tick',
      'raw',
      'inspect',
      'pending',
      'refresh',
      'abortSignal',
      'Boundary',
      'Portal',
      'Slot',
      'useSlots',
      'createContext',
      'useContext',
    ]
    for (const n of names) expect(typeof (api as Record<string, unknown>)[n], n).toBe('function')
  })

  test('untrack / tick / raw / abortSignal delegam ao runtime', async () => {
    expect(untrack(() => 7)).toBe(7)
    await expect(tick()).resolves.toBeUndefined()
    const o = { a: 1 }
    expect(raw(reactive(o))).toBe(o)
    expect(isReactive(reactive(raw({ b: 1 })))).toBe(false)
    expect(abortSignal().aborted).toBe(false)
  })
})

describe('mount', () => {
  test('alvo string (seletor) + thunk; unmount remove os nós e descarta', () => {
    const el = host()
    const cleanup = vi.fn()
    const unmount = mount(
      () =>
        component(() => {
          onCleanup(cleanup)
          return p(() => 'oi')
        }, {}),
      '#app',
    )
    expect(el.innerHTML).toBe('<p>oi</p>')
    unmount()
    expect(el.innerHTML).toBe('')
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  test('alvo Element + valor já renderizado (sem thunk)', () => {
    const el = host()
    const node = p(() => 'direto')
    mount(node, el)
    expect(el.firstChild).toBe(node)
  })

  test('alvo inexistente lança', () => {
    expect(() => mount(() => null, '#nada')).toThrow(/mount-target-missing/)
  })

  test('plugins: provide no owner raiz, target, roda antes de renderizar', () => {
    const el = host()
    const Theme = createContext<string>('claro')
    const order: string[] = []
    let seen: Element | null = null
    mount(
      () => {
        order.push('render')
        return component(() => p(() => useContext(Theme)), {})
      },
      '#app',
      {
        plugins: [
          (app) => {
            order.push('plugin')
            seen = app.target
            app.provide(Theme, 'escuro')
          },
        ],
      },
    )
    expect(order).toEqual(['plugin', 'render'])
    expect(seen).toBe(el)
    expect(el.textContent).toBe('escuro')
  })

  test('onError das opções e de plugins recebem erros não capturados', () => {
    host()
    const fromOptions = vi.fn()
    const fromPlugin = vi.fn()
    mount(
      () =>
        component(() => {
          throw new Error('boom')
        }, {}),
      '#app',
      { onError: fromOptions, plugins: [(app) => app.onError(fromPlugin)] },
    )
    expect(fromOptions).toHaveBeenCalledTimes(1)
    expect(fromPlugin).toHaveBeenCalledTimes(1)
    expect((fromPlugin.mock.calls[0]![0] as Error).message).toBe('boom')
    expect(fromPlugin.mock.calls[0]![1].phase).toBe('setup')
  })

  test('onError só de plugin (sem opção) também é instalado', () => {
    host()
    const handler = vi.fn()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mount(
      () =>
        component(() => {
          throw new Error('x')
        }, {}),
      '#app',
      { plugins: [(app) => app.onError(handler)] },
    )
    expect(handler).toHaveBeenCalledTimes(1)
    expect(err).not.toHaveBeenCalled()
  })
})

describe('efeitos', () => {
  test('watch roda depois de montar, reexecuta, cleanup antes da próxima e no unmount', async () => {
    host()
    const n = signal(0)
    const log: string[] = []
    const unmount = mount(
      () =>
        component(() => {
          watch(() => {
            const v = n.get()
            log.push(`run ${v}`)
            return () => log.push(`cleanup ${v}`)
          })
          log.push('setup')
          return null
        }, {}),
      '#app',
    )
    expect(log).toEqual(['setup', 'run 0'])
    n.set(1)
    await tick()
    expect(log).toEqual(['setup', 'run 0', 'cleanup 0', 'run 1'])
    unmount()
    expect(log.at(-1)).toBe('cleanup 1')
  })

  test('onMount roda uma vez, sem rastrear', async () => {
    host()
    const n = signal(0)
    const fn = vi.fn(() => n.get())
    mount(() => component(() => (onMount(fn), null), {}), '#app')
    expect(fn).toHaveBeenCalledTimes(1)
    n.set(1)
    await tick()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('on: alvo fixo, removido no unmount; getter também aceito', () => {
    host()
    const target = new EventTarget()
    const h1 = vi.fn()
    const h2 = vi.fn()
    const unmount = mount(
      () =>
        component(() => {
          on(target, 'ping', h1)
          on((() => target) as unknown as EventTarget, 'ping', h2)
          return null
        }, {}),
      '#app',
    )
    target.dispatchEvent(new Event('ping'))
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
    unmount()
    target.dispatchEvent(new Event('ping'))
    expect(h1).toHaveBeenCalledTimes(1)
  })

  test('inspect loga em dev (funções como getters)', async () => {
    host()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const n = signal(1)
    mount(() => component(() => (inspect(() => n.get(), 'fixo'), null), {}), '#app')
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining('inspect'), 1, 'fixo')
    n.set(2)
    await tick()
    expect(log).toHaveBeenLastCalledWith(expect.stringContaining('inspect'), 2, 'fixo')
  })
})

describe('async', () => {
  test('pending/refresh com Resource', async () => {
    host()
    let resolve!: (v: string) => void
    let res!: Resource<string>
    mount(
      () =>
        component(() => {
          res = resource(() => new Promise<string>((r) => (resolve = r)))
          return null
        }, {}),
      '#app',
    )
    resolve('a')
    await Promise.resolve()
    await tick()
    expect(pending(res)).toBe(false)
    refresh(res)
    await tick()
    expect(pending(res)).toBe(true)
    resolve('b')
    await Promise.resolve()
    await tick()
    expect(pending(res)).toBe(false)
    expect(res.value.get()).toBe('b')
  })

  test('Boundary via component(): pending, conteúdo, erro com retry', async () => {
    const el = host()
    let resolve!: (v: string) => void
    let fail = true
    const User = () => {
      const r = resource(() => new Promise<string>((res) => (resolve = res)))
      return () => (r.value.get() === undefined ? null : p(() => r.value.get()!))
    }
    const Bad = () => {
      if (fail) throw new Error('ruim')
      return p(() => 'ok')
    }
    mount(
      () => [
        publicComponent(Boundary, {
          get pending() {
            return p(() => '...')
          },
          get children() {
            return component(User, {})
          },
        }),
        publicComponent(Boundary, {
          error: (e: unknown, retry: () => void) => {
            const b = document.createElement('button')
            b.textContent = (e as Error).message
            b.onclick = retry
            return b
          },
          get children() {
            return component(Bad, {})
          },
        }),
      ],
      '#app',
    )
    expect(el.textContent).toBe('...ruim')
    resolve('Ana')
    await Promise.resolve()
    await tick()
    expect(el.textContent).toBe('Anaruim')
    fail = false
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('Anaok')
  })
})

describe('Portal', () => {
  test('renderiza no alvo mantendo o contexto; nada no lugar de origem; dispose remove', () => {
    const el = host()
    const modal = host('modal')
    const Ctx = createContext<string>()
    const unmount = mount(
      () =>
        publicComponent(Ctx.Provider, {
          value: 'ctx',
          get children() {
            return publicComponent(Portal, {
              to: modal,
              get children() {
                return component(() => p(() => useContext(Ctx)), {})
              },
            })
          },
        }),
      el,
    )
    expect(el.innerHTML).toBe('')
    expect(modal.textContent).toBe('ctx')
    unmount()
    expect(modal.textContent).toBe('')
  })
})

describe('slots', () => {
  test('useSlots: objeto de slots do compilador passa direto; children comuns viram default', () => {
    const compiled = { [SLOTS]: true, default: () => 'corpo', header: () => 'topo' }
    expect(useSlots(compiled as unknown as JSX.Element)).toBe(compiled)

    host()
    let s!: ReturnType<typeof useSlots>
    mount(() => component(() => ((s = useSlots('texto')), null), {}), '#app')
    expect((s.default as unknown as () => Rendered)()).toBe('texto')
  })

  test('Slot é marcador: lança not-compiled', () => {
    expect(() => Slot({ name: 'x' })).toThrow(/not-compiled.*Slot/)
  })
})

describe('contexto', () => {
  test('Provider fornece aos descendentes; default fora; sem default lança', () => {
    const el = host()
    const Ctx = createContext('padrão')
    const Read = () => p(() => useContext(Ctx))
    mount(
      () => [
        component(Read, {}),
        publicComponent(Ctx.Provider, {
          value: 'dentro',
          get children() {
            return component(Read, {})
          },
        }),
      ],
      el,
    )
    expect(el.textContent).toBe('padrãodentro')
    expect(typeof Ctx.id).toBe('symbol')
    expect(Ctx.defaultValue).toBe('padrão')

    const Empty = createContext<number>()
    host('b')
    const errors = vi.fn()
    mount(() => component(() => useContext(Empty), {}), '#b', { onError: errors })
    expect((errors.mock.calls[0]![0] as Error).message).toMatch(/context-missing/)
  })
})

describe('contexto reativo (I-3)', () => {
  test('Provider com `value` getter: o derivado que recebe useContext acompanha', async () => {
    const el = host()
    const Ctx = createContext<string>()
    const theme = signal('claro')
    const Read = () => {
      const value = memo(() => useContext(Ctx))
      const out = document.createElement('p')
      effect(() => void (out.textContent = value.get()), { kind: 'render' })
      return out
    }
    mount(
      () =>
        publicComponent(Ctx.Provider, {
          get value() {
            return theme.get()
          },
          get children() {
            return component(Read, {})
          },
        }),
      el,
    )
    expect(el.textContent).toBe('claro')
    theme.set('escuro')
    await tick()
    expect(el.textContent).toBe('escuro')
  })
})

describe('marcadores de compilação', () => {
  test('external, pending/refresh sobre valor comum lançam not-compiled', () => {
    expect(() => external(() => 1)).toThrow(/not-compiled.*external/)
    expect(() => pending({ name: 'Ana' })).toThrow(/not-compiled.*pending/)
    expect(() => refresh('x')).toThrow(/not-compiled.*refresh/)
  })
})
