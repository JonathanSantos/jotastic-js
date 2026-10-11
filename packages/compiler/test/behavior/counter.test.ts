// Comportamento do exemplo 01 compilado (19-plano-de-testes.md §Compilador): clique em +5 → `effects: 4`
// (count, double, classList, disabled) e `Counter` não reexecuta.
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import type { DevtoolsEvent } from 'jotastic/runtime'
import { load, spec } from '../helpers'

// `mount` de `jotastic` (18 §13–14) recebe o thunk; aqui ele só é capturado e montado pelo `render` do @jotastic/test.
const mounted: Array<{ thunk: () => unknown; target: unknown }> = []
vi.mock('jotastic', () => ({ mount: (thunk: () => unknown, target: unknown) => mounted.push({ thunk, target }) }))

// eventos de devtools (o hook do @jotastic/test encadeia com este)
const events: DevtoolsEvent[] = []
;(globalThis as { __JOTASTIC_DEVTOOLS__?: unknown }).__JOTASTIC_DEVTOOLS__ = {
  emit: (e: DevtoolsEvent) => events.push(e),
  registry: { owners: new Map() },
}

afterEach(cleanup)

describe('01-counter compilado', () => {
  let mod: { Counter: (props: Record<string, unknown>) => unknown }
  beforeAll(async () => {
    mod = await load(spec('examples/01-counter.tsx'), 'Counter.tsx')
  })

  test('mount recebe um thunk e o alvo', () => {
    expect(mounted).toHaveLength(1)
    expect(typeof mounted[0]!.thunk).toBe('function')
    expect(mounted[0]!.target).toBe('#app')
    expect(typeof mod.Counter).toBe('function')
  })

  test('clique em +5: 4 efeitos, Counter não reexecuta', async () => {
    const { container } = render(mounted[0]!.thunk)
    const section = container.querySelector('section')!
    const [h2, p] = [container.querySelector('h2')!, container.querySelector('p')!]
    const [plus, minus, reset] = Array.from(container.querySelectorAll('button'))
    expect(h2.textContent).toBe('Contador')
    expect(p.textContent).toBe('0 (dobro: 0)')
    expect(p.className).toBe('even')
    expect(plus!.textContent).toBe('+5')
    expect(minus!.textContent).toBe('-5')
    expect(reset!.hasAttribute('disabled')).toBe(true)
    const text0 = p.firstChild

    await tick()
    resetCounts()
    events.length = 0
    plus!.click()
    await tick()

    expect(counts().effects).toBe(4)
    expect(counts().memos).toBe(2) // double, isEven
    expect(events.filter((e) => e.type === 'owner:create')).toHaveLength(0) // nenhum componente recriado
    expect(container.querySelector('section')).toBe(section)
    expect(p.firstChild).toBe(text0)
    expect(p.textContent).toBe('5 (dobro: 10)')
    expect(p.className).toBe('odd')
    expect(reset!.hasAttribute('disabled')).toBe(false)

    reset!.click()
    await tick()
    expect(p.textContent).toBe('0 (dobro: 0)')
    expect(reset!.hasAttribute('disabled')).toBe(true)
  })
})
