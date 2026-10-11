import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { Counter } from './Counter'

afterEach(cleanup)

describe('Counter', () => {
  it('soma `step` a cada clique e atualiza os derivados', async () => {
    const { container } = render(<Counter label="x" step={5} />)
    const p = container.querySelector('p')!
    expect(p.textContent).toBe('0 (dobro: 0)')

    container.querySelector('button')!.click()
    await tick()
    expect(p.textContent).toBe('5 (dobro: 10)')
    expect(p.className).toBe('odd')
  })

  it('o componente não roda de novo: só os bindings afetados', async () => {
    const { container } = render(<Counter />)
    resetCounts()
    container.querySelector('button')!.click()
    await tick()
    // Counter() não roda de novo: 4 bindings (texto de count, texto de double, classe, disabled), 2 memos
    // (double, isEven) e 4 escritas no DOM. Nenhuma comparação de árvore.
    expect(counts()).toEqual({ effects: 4, memos: 2, writes: 4 })
  })
})
