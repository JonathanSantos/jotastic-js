import { afterEach, expect, test, vi } from 'vitest'
import { component } from 'jotastic/runtime'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { App, Counter } from './01-counter.js'

afterEach(cleanup)

function dom(container: HTMLElement) {
  const [plus, minus, reset] = Array.from(container.querySelectorAll('button'))
  return {
    h2: container.querySelector('h2')!,
    p: container.querySelector('p')!,
    plus: plus!,
    minus: minus!,
    reset: reset!,
  }
}

test('Counter: monta o thunk do módulo (step 5)', () => {
  const { container } = render(App)
  const { h2, p, plus, minus, reset } = dom(container)
  expect(h2.textContent).toBe('Contador')
  expect(p.textContent).toBe('0 (dobro: 0)')
  expect(p.className).toBe('even')
  expect(plus.textContent).toBe('+5')
  expect(minus.textContent).toBe('-5')
  expect(reset.disabled).toBe(true)
  // `text` (D64) troca cada `<!>` por um Text: nenhum comentário sobra nos escalares
  expect(Array.from(p.childNodes).some((n) => n.nodeType === 8)).toBe(false)
})

test('Counter: clique em +5 → effects: 4 (text count, text double, classList, disabled); Counter não reexecuta', async () => {
  const Spy = vi.fn(Counter)
  const { container } = render(() => component(Spy, { step: 5 }, { name: 'Counter' }))
  const { p, plus, reset } = dom(container)
  const section = container.firstChild
  expect(Spy).toHaveBeenCalledTimes(1)

  resetCounts()
  plus.click()
  await tick()

  expect(counts().effects).toBe(4)
  expect(counts().memos).toBe(2) // double, isEven
  expect(p.textContent).toBe('5 (dobro: 10)')
  expect(p.className).toBe('odd')
  expect(reset.disabled).toBe(false)
  expect(Spy).toHaveBeenCalledTimes(1)
  expect(container.firstChild!.isSameNode(section)).toBe(true)
})

test('Counter: -5, zerar e label/step reativos via props', async () => {
  const { container } = render(App)
  const { p, plus, minus, reset } = dom(container)
  plus.click()
  plus.click()
  minus.click()
  await tick()
  expect(p.textContent).toBe('5 (dobro: 10)')
  reset.click()
  await tick()
  expect(p.textContent).toBe('0 (dobro: 0)')
  expect(p.className).toBe('even')
  expect(reset.disabled).toBe(true)
})

test('Counter: sem step usa 1 e label vem de props', async () => {
  const { container } = render(() => component(Counter, { label: 'Pontos' }))
  const { h2, p, plus } = dom(container)
  expect(h2.textContent).toBe('Pontos')
  expect(plus.textContent).toBe('+1')
  plus.click()
  await tick()
  expect(p.textContent).toBe('1 (dobro: 2)')
})
