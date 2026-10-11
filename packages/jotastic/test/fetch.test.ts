import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fetch } from '../src/fetch'
import { createOwner, dispose, effect, flush, runWithOwner, signal } from '../src/runtime/index'

let calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []

beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init])
      return Promise.resolve(new Response('ok'))
    }),
  )
})

afterEach(() => {
  flush()
  vi.unstubAllGlobals()
})

describe('jotastic/fetch (R20/D54)', () => {
  test('dentro de um effect anexa abortSignal(), abortado no cleanup', async () => {
    const dep = signal(0)
    const root = createOwner('root', null)
    runWithOwner(root, () =>
      effect(() => {
        dep.get()
        fetch('/a', { method: 'POST' })
      }),
    )
    flush()
    expect(calls).toHaveLength(1)
    const [input, init] = calls[0]!
    expect(input).toBe('/a')
    expect(init!.method).toBe('POST')
    const first = init!.signal!
    expect(first.aborted).toBe(false)
    dep.set(1)
    flush()
    expect(first.aborted).toBe(true)
    const second = calls[1]![1]!.signal!
    expect(second.aborted).toBe(false)
    dispose(root)
    expect(second.aborted).toBe(true)
  })

  test('fora de efeito: signal que nunca aborta', () => {
    fetch('/b')
    expect(calls[0]![1]!.signal!.aborted).toBe(false)
  })

  test('init.signal presente: combina com o ambiente (qualquer um aborta)', () => {
    const dep = signal(0)
    const user = new AbortController()
    const root = createOwner('root', null)
    runWithOwner(root, () =>
      effect(() => {
        dep.get()
        fetch('/c', { signal: user.signal })
      }),
    )
    flush()
    const s1 = calls[0]![1]!.signal!
    expect(s1).not.toBe(user.signal)
    dep.set(1) // cleanup do efeito
    flush()
    expect(s1.aborted).toBe(true)
    expect(user.signal.aborted).toBe(false)
    const s2 = calls[1]![1]!.signal!
    user.abort('stop')
    expect(s2.aborted).toBe(true)
    expect(s2.reason).toBe('stop')
    dispose(root)
  })

  test('fallback sem AbortSignal.any', () => {
    const original = AbortSignal.any
    ;(AbortSignal as { any?: unknown }).any = undefined
    try {
      const user = new AbortController()
      const root = createOwner('root', null)
      runWithOwner(root, () => effect(() => void fetch('/d', { signal: user.signal })))
      flush()
      const s = calls[0]![1]!.signal!
      expect(s).not.toBe(user.signal)
      expect(s.aborted).toBe(false)
      dispose(root)
      expect(s.aborted).toBe(true)
      expect(user.signal.aborted).toBe(false)
    } finally {
      AbortSignal.any = original
    }
  })
})
