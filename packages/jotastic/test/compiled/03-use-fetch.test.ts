import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { component, insert, signal } from 'jotastic/runtime'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { useClickOutside, useFetch, useMediaQuery } from './03-use-fetch.js'
import { mockFetch } from './fetch-mock'

let net: ReturnType<typeof mockFetch>
beforeEach(() => {
  net = mockFetch()
})
afterEach(() => {
  cleanup()
  net.restore()
})

/** Componente de teste no formato compilado: `useFetch(() => url, () => undefined)` + um binding de texto. */
function fetchHarness() {
  const url = signal('/api/a')
  function Harness() {
    const res = useFetch<{ name: string }>(
      () => url.get(),
      () => undefined,
    )
    const p = document.createElement('p')
    insert(p, () => (res.loading ? 'loading' : res.error ? `erro: ${res.error.message}` : res.data!.name), null)
    return p
  }
  const { container } = render(() => component(Harness, {}))
  return { url, text: () => container.textContent }
}

test('useFetch: loading → data; params chegam como getters', async () => {
  const h = fetchHarness()
  expect(h.text()).toBe('loading')
  expect(net.requests.map((r) => r.url)).toEqual(['/api/a'])
  resetCounts()
  await net.requests[0]!.resolve({ name: 'Ana' })
  expect(h.text()).toBe('Ana')
  expect(counts().effects).toBe(1) // só o binding de texto
})

test('useFetch: resposta !ok → error', async () => {
  const h = fetchHarness()
  await net.requests[0]!.resolve(null, { ok: false, statusText: 'Not Found' })
  expect(h.text()).toBe('erro: Not Found')
})

test('useFetch: url muda → 1 requisição nova, anterior abortada (AbortError ignorado)', async () => {
  const h = fetchHarness()
  await net.requests[0]!.resolve({ name: 'Ana' })
  h.url.set('/api/b')
  await tick()
  expect(net.requests.map((r) => r.url)).toEqual(['/api/a', '/api/b'])
  expect(h.text()).toBe('loading')

  h.url.set('/api/c')
  await tick()
  expect(net.requests[1]!.signal.aborted).toBe(true)
  expect(net.requests[2]!.signal.aborted).toBe(false)
  await net.requests[1]!.resolve({ name: 'velho' }) // já abortada: rejeita com AbortError, ignorado
  expect(h.text()).toBe('loading')
  await net.requests[2]!.resolve({ name: 'Cid' })
  expect(h.text()).toBe('Cid')
})

test('useFetch: unmount aborta a requisição em andamento', async () => {
  fetchHarness()
  cleanup()
  expect(net.requests[0]!.signal.aborted).toBe(true)
})

// ─── useMediaQuery ───────────────────────────────────────────────────────────

class FakeMql extends EventTarget {
  constructor(
    public media: string,
    public matches: boolean,
  ) {
    super()
  }
  change(matches: boolean) {
    this.matches = matches
    const e = new Event('change') as Event & { matches: boolean }
    e.matches = matches
    this.dispatchEvent(e)
  }
}

test('useMediaQuery: valor inicial, evento change, troca de query move o listener', async () => {
  const mqls: FakeMql[] = []
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => {
      const m = new FakeMql(q, q.includes('min-width: 100px'))
      mqls.push(m)
      return m
    }),
  )
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const query = signal('(min-width: 100px)')
  function Harness() {
    const mq = useMediaQuery(() => query.get())
    const p = document.createElement('p')
    insert(p, () => (mq.matches ? 'sim' : 'não'), null)
    return p
  }
  const { container } = render(() => component(Harness, {}))
  expect(container.textContent).toBe('sim')

  mqls[0]!.change(false)
  await tick()
  expect(container.textContent).toBe('não')

  query.set('(min-width: 900px)')
  await tick()
  expect(mqls).toHaveLength(2)
  // C-2: `mql` é um memo que devolve instância de classe, mas sem método de ciclo de vida → não avisa
  expect(warn.mock.calls.some((c) => String(c[0]).includes('derived-recreates-instance'))).toBe(false)
  warn.mockRestore()
  mqls[1]!.change(true)
  await tick()
  expect(container.textContent).toBe('sim')
  mqls[0]!.change(false) // listener antigo removido
  await tick()
  expect(container.textContent).toBe('sim')

  // Pendência (relatório): trocar a query não relê `mql.matches`; o valor fica o da query anterior até um `change`
  query.set('(min-width: 100px) and (x)') // FakeMql nasce com matches = true
  await tick()
  expect(mqls[2]!.matches).toBe(true)
  mqls[1]!.change(false)
  await tick()
  expect(container.textContent).toBe('sim') // listener antigo removido
  query.set('(max-width: 1px)') // nasce false, mas o texto não muda
  await tick()
  expect(mqls[3]!.matches).toBe(false)
  expect(container.textContent).toBe('sim')
})

test('useClickOutside: handler (getter) chamado só para clique fora do elemento', async () => {
  const handler = vi.fn()
  let box!: HTMLDivElement
  function Harness() {
    box = document.createElement('div')
    box.appendChild(document.createElement('span'))
    useClickOutside(
      () => box,
      () => handler,
    )
    return box
  }
  render(() => component(Harness, {}))
  await tick()
  box.firstChild!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(handler).not.toHaveBeenCalled()
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(handler).toHaveBeenCalledTimes(1)
})
