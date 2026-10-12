import { afterEach, describe, expect, test, vi } from 'vitest'
import { boundary, continuation, resource, type Resource } from '../src/runtime/async'
import { insert, listen, template } from '../src/runtime/dom'
import { branches, component, type Rendered } from '../src/runtime/flow'
import { createOwner, dispose, getOwner, runWithOwner, type ErrorInfo, type Owner } from '../src/runtime/owner'
import { abortSignal, effect, flush, signal, tick } from '../src/runtime/reactive'
import { createRoot } from '../src/runtime/root'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
  signal: AbortSignal
}

/** Fábrica de requisições controladas pelo teste: cada chamada guarda o signal recebido. */
function requests<T>() {
  const calls: Deferred<T>[] = []
  const fn = (signal: AbortSignal): Promise<T> => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    calls.push({ promise, resolve, reject, signal })
    return promise
  }
  return { calls, fn }
}

/** Deixa Promises resolvidas propagarem e roda o flush seguinte. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await tick()
}

function inRoot<T>(fn: (root: Owner) => T): T {
  const root = createOwner('root', null)
  return runWithOwner(root, () => fn(root))
}

function mount(render: () => unknown, onError?: (e: unknown, info: ErrorInfo) => void) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = createRoot(container, render, { onError })
  return { container, unmount }
}

const tP = template('<p></p>')
const tB = template('<button></button>')

function text(read: () => unknown): Node {
  const el = tP()
  insert(el, read, null)
  return el
}

afterEach(() => {
  flush()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('async (A1–A9)', () => {
  test('A1 resource com props.id mudando antes de resolver: resposta antiga ignorada; controller antigo abortado', async () => {
    const id = signal(1)
    const { calls, fn } = requests<string>()
    const ids: number[] = []
    const r = inRoot(() =>
      resource((s) => {
        ids.push(id.get())
        return fn(s)
      }),
    )
    expect(calls.length).toBe(1)
    expect(r.version).toBe(1)
    id.set(2)
    flush()
    expect(ids).toEqual([1, 2])
    expect(calls.length).toBe(2)
    expect(r.version).toBe(2)
    expect(calls[0]!.signal.aborted).toBe(true)
    expect(calls[1]!.signal.aborted).toBe(false)

    calls[1]!.resolve('novo')
    await settle()
    calls[0]!.resolve('velho')
    await settle()
    expect(r.value.get()).toBe('novo')
    expect(r.error.get()).toBeUndefined()
  })

  test('A2 loading só até o primeiro valor; pending nas recargas; fn síncrona → valor imediato', async () => {
    const { calls, fn } = requests<number>()
    const r = inRoot(() => resource(fn))
    expect([r.loading.get(), r.pending.get(), r.value.get()]).toEqual([true, false, undefined])
    calls[0]!.resolve(1)
    await settle()
    expect([r.loading.get(), r.pending.get(), r.value.get()]).toEqual([false, false, 1])

    r.refresh()
    flush()
    expect([r.loading.get(), r.pending.get(), r.value.get()]).toEqual([false, true, 1]) // mantém value
    calls[1]!.resolve(2)
    await settle()
    expect([r.loading.get(), r.pending.get(), r.value.get()]).toEqual([false, false, 2])

    // Erro na recarga: loading continua false, pending volta a false; value antigo mantido.
    r.refresh()
    flush()
    const onError = vi.fn()
    calls[2]!.reject(new Error('x'))
    const err = vi.spyOn(console, 'error').mockImplementation(onError)
    await settle()
    expect(err).toHaveBeenCalled()
    expect([r.loading.get(), r.pending.get(), r.value.get()]).toEqual([false, false, 2])
    expect((r.error.get() as Error).message).toBe('x')

    const s = inRoot(() => resource(() => ({ n: 1 })))
    expect([s.loading.get(), s.pending.get()]).toEqual([false, false])
    expect(s.value.get()).toEqual({ n: 1 })
    s.refresh()
    flush()
    expect(s.pending.get()).toBe(false)
  })

  test('A3 continuation: fn roda 1 vez; refresh não recria; value novo atualiza só o binding', async () => {
    const { calls, fn } = requests<{ name: string }>()
    const setup = vi.fn()
    let reads = 0
    let res!: Resource<{ name: string }>
    const { container } = mount(() => {
      res = resource(fn)
      return continuation(res as Resource<unknown>, () => {
        setup()
        return text(() => {
          reads++
          return res.value.get()!.name
        })
      })
    })
    expect(setup).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')

    calls[0]!.resolve({ name: 'Ana' })
    await settle()
    expect(setup).toHaveBeenCalledTimes(1)
    const p = container.querySelector('p')!
    expect(p.textContent).toBe('Ana')
    expect(reads).toBe(1)

    res.refresh()
    await tick()
    expect(res.pending.get()).toBe(true)
    calls[1]!.resolve({ name: 'Bia' })
    await settle()
    expect(setup).toHaveBeenCalledTimes(1)
    expect(container.querySelector('p')).toBe(p)
    expect(p.textContent).toBe('Bia')
    expect(reads).toBe(2)
  })

  test('A4 boundary com 2 recursos: pending até os dois resolverem; depois children', async () => {
    const a = requests<string>()
    const b = requests<string>()
    const childSetup = vi.fn()
    const Child = (props: { req: (s: AbortSignal) => Promise<string> }): Rendered => {
      childSetup()
      const r = resource(props.req)
      return continuation(r as Resource<unknown>, () => text(() => r.value.get()))
    }
    const { container } = mount(() =>
      boundary({
        pending: () => text(() => 'carregando'),
        children: () => [component(Child, { req: a.fn }), component(Child, { req: b.fn })],
      }),
    )
    // Children renderizados já (os recursos rodaram), mas fora do DOM.
    expect(childSetup).toHaveBeenCalledTimes(2)
    expect(a.calls.length).toBe(1)
    expect(b.calls.length).toBe(1)
    expect(container.textContent).toBe('carregando')

    a.calls[0]!.resolve('A')
    await settle()
    expect(container.textContent).toBe('carregando')

    b.calls[0]!.resolve('B')
    await settle()
    expect(container.textContent).toBe('AB')
    expect(container.querySelectorAll('p').length).toBe(2)

    // Sem `pending`: nada enquanto carrega.
    const c = requests<string>()
    const m2 = mount(() => boundary({ children: () => component(Child, { req: c.fn }) }))
    expect(m2.container.textContent).toBe('')
    c.calls[0]!.resolve('C')
    await settle()
    expect(m2.container.textContent).toBe('C')
  })

  test('A5 boundary captura erro de await, handler sync, handler async e efeito; retry recria e refaz', async () => {
    type Mode = 'await' | 'sync' | 'async' | 'effect' | 'ok'
    const runs = vi.fn()
    const captured: unknown[] = []
    let retryFn: (() => void) | null = null
    const mode = { current: 'await' as Mode }
    const trigger = signal(0)

    const Child = (): Rendered => {
      runs()
      const m = mode.current
      const r = resource(() => (m === 'await' ? Promise.reject(new Error('await')) : Promise.resolve('dados')))
      if (m === 'effect')
        effect(() => {
          if (trigger.get() > 0) throw new Error('effect')
        })
      return continuation(r as Resource<unknown>, () => {
        const btn = tB()
        btn.textContent = String(r.value.get())
        listen(btn, 'click', () => {
          if (m === 'sync') throw new Error('sync')
          if (m === 'async') return Promise.reject(new Error('async'))
        })
        return btn
      })
    }

    const { container } = mount(() =>
      boundary({
        pending: () => text(() => '...'),
        error: (e, retry) => {
          captured.push(e)
          retryFn = retry
          return text(() => `erro: ${(e as Error).message}`)
        },
        children: () => component(Child, {}),
      }),
    )

    const expectError = async (msg: string) => {
      await settle()
      expect(container.textContent).toBe(`erro: ${msg}`)
      expect(container.querySelector('button')).toBeNull()
    }
    const retry = async (next: Mode) => {
      mode.current = next
      const before = runs.mock.calls.length
      retryFn!()
      await settle()
      expect(runs.mock.calls.length).toBe(before + 1)
    }

    // await (primeiro carregamento)
    expect(runs).toHaveBeenCalledTimes(1)
    await expectError('await')

    // handler síncrono
    await retry('sync')
    expect(container.textContent).toBe('dados')
    container.querySelector('button')!.click()
    await expectError('sync')

    // handler async
    await retry('async')
    container.querySelector('button')!.click()
    await expectError('async')

    // efeito
    await retry('effect')
    expect(container.textContent).toBe('dados')
    trigger.set(1)
    await expectError('effect')

    // retry recria e refaz: volta ao conteúdo
    trigger.set(0)
    await retry('ok')
    expect(container.textContent).toBe('dados')
    expect(captured.map((e) => (e as Error).message)).toEqual(['await', 'sync', 'async', 'effect'])

    // Setup e binding também (09-erros §Boundary).
    const show = (e: unknown) => text(() => `erro: ${(e as Error).message}`)
    const m1 = mount(() =>
      boundary({
        error: show,
        children: () =>
          component((): Rendered => {
            throw new Error('setup')
          }, {}),
      }),
    )
    expect(m1.container.textContent).toBe('erro: setup')
    const bad = signal(false)
    const m2 = mount(() =>
      boundary({
        error: show,
        children: () =>
          text(() => {
            if (bad.get()) throw new Error('binding')
            return 'ok'
          }),
      }),
    )
    expect(m2.container.textContent).toBe('ok')
    bad.set(true)
    await tick()
    await tick()
    expect(m2.container.textContent).toBe('erro: binding')
  })

  test('boundary: não-Error lançado chega ao error() embrulhado em Error (original em cause)', () => {
    const got: unknown[] = []
    const { container } = mount(() =>
      boundary({
        error: (e) => (got.push(e), text(() => (e as Error).message)),
        children: () =>
          component((): Rendered => {
            throw 'texto'
          }, {}),
      }),
    )
    expect(got[0]).toBeInstanceOf(Error)
    expect((got[0] as Error).message).toBe('texto')
    expect((got[0] as Error).cause).toBe('texto')
    expect(container.textContent).toBe('texto')

    const original = new TypeError('tipo')
    mount(() =>
      boundary({
        error: (e) => (got.push(e), null),
        children: () =>
          component((): Rendered => {
            throw original
          }, {}),
      }),
    )
    expect(got[1]).toBe(original)
  })

  test('A6 boundary sem error: erro sobe para o próximo boundary / root onError', async () => {
    const Bad = (): Rendered => {
      const r = resource(() => Promise.reject(new Error('falhou')))
      return continuation(r as Resource<unknown>, () => text(() => 'nunca'))
    }

    // Root onError.
    const onError = vi.fn()
    const m1 = mount(() => boundary({ pending: () => text(() => '...'), children: () => component(Bad, {}) }), onError)
    await settle()
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0]![0] as Error).message).toBe('falhou')
    expect((onError.mock.calls[0]![1] as ErrorInfo).phase).toBe('async')
    expect(m1.container.textContent).toBe('')

    // Próximo boundary com `error`.
    const outerError = vi.fn((e: unknown) => text(() => `fora: ${(e as Error).message}`))
    const m2 = mount(() =>
      boundary({
        error: outerError,
        children: () => boundary({ children: () => component(Bad, {}) }),
      }),
    )
    await settle()
    expect(outerError).toHaveBeenCalledTimes(1)
    expect(m2.container.textContent).toBe('fora: falhou')

    // Erro dentro da própria view de erro sobe (a view usa a fronteira de fora).
    const onError2 = vi.fn()
    mount(
      () =>
        boundary({
          error: () => {
            throw new Error('na view')
          },
          children: () => component(Bad, {}),
        }),
      onError2,
    )
    await settle()
    expect(onError2.mock.calls.map((c) => (c[0] as Error).message)).toEqual(['na view'])
  })

  test('A7 abortSignal() em função chamada por fn é o signal do recurso; após await interno, nunca aborta', async () => {
    const seen: AbortSignal[] = []
    let after: AbortSignal | null = null
    const api = async (): Promise<number> => {
      seen.push(abortSignal())
      await Promise.resolve()
      after = abortSignal()
      return 1
    }
    const id = signal(0)
    const passed: AbortSignal[] = []
    inRoot(() =>
      resource((s) => {
        id.get()
        passed.push(s)
        return api()
      }),
    )
    expect(seen[0]).toBe(passed[0])
    await settle()
    expect(after).not.toBeNull()
    expect(after).not.toBe(passed[0])
    id.set(1)
    flush()
    expect(seen[1]).toBe(passed[1])
    expect(passed[0]!.aborted).toBe(true)
    await settle()
    expect(after!.aborted).toBe(false)
    expect(abortSignal().aborted).toBe(false) // fora de recurso e de efeito
  })

  test("A8 let x = await + x.name = 'y': binding atualiza; refresh traz valor do servidor", async () => {
    const { calls, fn } = requests<{ name: string }>()
    let res!: Resource<{ name: string }>
    const { container } = mount(() => {
      res = resource(fn)
      return continuation(res as Resource<unknown>, () => text(() => res.value.get()!.name))
    })
    calls[0]!.resolve({ name: 'servidor' })
    await settle()
    expect(container.textContent).toBe('servidor')

    res.value.get()!.name = 'y' // optimistic: muta o objeto reativo
    await tick()
    expect(container.textContent).toBe('y')

    res.refresh()
    await tick()
    expect(container.textContent).toBe('y')
    calls[1]!.resolve({ name: 'servidor 2' })
    await settle()
    expect(container.textContent).toBe('servidor 2')
  })

  test('A9 dispose do owner com requisição em voo: abortado; nenhum set posterior', async () => {
    const { calls, fn } = requests<string>()
    const owner = createOwner('root', null)
    const r = runWithOwner(owner, () => {
      expect(getOwner()).toBe(owner)
      return resource(fn)
    })
    const observed = vi.fn()
    const watcher = createOwner('root', null)
    runWithOwner(watcher, () =>
      effect(
        () => {
          observed(r.value.get(), r.loading.get(), r.error.get(), r.pending.get())
        },
        { kind: 'render' },
      ),
    )
    expect(observed).toHaveBeenCalledTimes(1)

    dispose(owner)
    expect(calls[0]!.signal.aborted).toBe(true)
    calls[0]!.resolve('tarde')
    await settle()
    expect(observed).toHaveBeenCalledTimes(1)
    expect(r.value.peek()).toBeUndefined()
    expect(r.loading.peek()).toBe(true)

    r.refresh()
    await settle()
    expect(calls.length).toBe(1)

    // Rejeição tardia também é ignorada (sem handleError).
    const b = requests<string>()
    const o2 = createOwner('root', null)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    runWithOwner(o2, () => resource(b.fn))
    dispose(o2)
    b.calls[0]!.reject(new Error('tarde'))
    await settle()
    expect(err).not.toHaveBeenCalled()
    dispose(watcher)
  })
})
