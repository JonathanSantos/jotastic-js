// Comportamento de `use*` compiladas (18 §11): useFetch/useMediaQuery/useClickOutside de examples/07 compiladas e
// chamadas por componentes também compilados (a chamada embrulha os argumentos em getters). Mesmas asserções de
// packages/jotastic/test/compiled/03-use-fetch.test.ts (que roda a cópia escrita à mão de compiled/03).
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { component, signal, type Rendered } from 'jotastic/runtime'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { mockFetch } from '../../../jotastic/test/compiled/fetch-mock'
import { load } from '../helpers'
import { useFetchInput } from '../inputs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props dos componentes compilados não são tipadas
type Comp = (props: any) => Rendered

const harness = `
export function FetchHarness({ url }: { url: string }) {
  const res = useFetch<{ name: string }>(url)
  return <p>{res.loading ? 'loading' : res.error ? \`erro: \${res.error.message}\` : res.data!.name}</p>
}

export function MediaHarness({ query }: { query: string }) {
  const mq = useMediaQuery(query)
  return <p>{mq.matches ? 'sim' : 'não'}</p>
}

export function ClickHarness({ onOutside }: { onOutside: () => void }) {
  let box!: HTMLDivElement
  useClickOutside(box, onOutside)
  return <div ref={box}><span /></div>
}
`

let mod: Record<string, Comp>
beforeAll(async () => {
  mod = await load(useFetchInput() + harness, 'useFetch.tsx')
})

let net: ReturnType<typeof mockFetch>
beforeEach(() => {
  net = mockFetch()
})
afterEach(() => {
  cleanup()
  net.restore()
})

function fetchHarness() {
  const url = signal('/api/a')
  const { container } = render(() =>
    component(mod.FetchHarness!, {
      get url() {
        return url.get()
      },
    }),
  )
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
  await net.requests[1]!.resolve({ name: 'velho' })
  expect(h.text()).toBe('loading')
  await net.requests[2]!.resolve({ name: 'Cid' })
  expect(h.text()).toBe('Cid')
})

test('useFetch: unmount aborta a requisição em andamento', async () => {
  fetchHarness()
  cleanup()
  expect(net.requests[0]!.signal.aborted).toBe(true)
})

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
  const { container } = render(() =>
    component(mod.MediaHarness!, {
      get query() {
        return query.get()
      },
    }),
  )
  expect(container.textContent).toBe('sim')

  mqls[0]!.change(false)
  await tick()
  expect(container.textContent).toBe('não')

  query.set('(min-width: 900px)')
  await tick()
  expect(mqls).toHaveLength(2)
  // C-2: `mql` é um memo que devolve instância de classe → em dev avisa derived-recreates-instance
  expect(warn.mock.calls.some((c) => String(c[0]).includes('derived-recreates-instance'))).toBe(true)
  warn.mockRestore()
  mqls[1]!.change(true)
  await tick()
  expect(container.textContent).toBe('sim')
  mqls[0]!.change(false) // listener antigo removido
  await tick()
  expect(container.textContent).toBe('sim')

  // C-2: trocar a query não relê `mql.matches`; o valor fica o da query anterior até um `change`
  query.set('(min-width: 100px) and (x)')
  await tick()
  expect(mqls[2]!.matches).toBe(true)
  mqls[1]!.change(false)
  await tick()
  expect(container.textContent).toBe('sim')
  query.set('(max-width: 1px)')
  await tick()
  expect(mqls[3]!.matches).toBe(false)
  expect(container.textContent).toBe('sim')
})

test('useClickOutside: ref passado direto (lido lazy) e handler chamado só para clique fora', async () => {
  const handler = vi.fn()
  const { container } = render(() => component(mod.ClickHarness!, { onOutside: handler }))
  await tick()
  const box = container.querySelector('div')!
  box.firstChild!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(handler).not.toHaveBeenCalled()
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  expect(handler).toHaveBeenCalledTimes(1)
})
