// Regras de `use*` (18 §11) executadas contra o runtime: parâmetros lazy (default, desestruturado, rest), retorno
// por propriedade (getter/setter de `let`, memo hoisted, getter de parâmetro), resultado desestruturado.
import { afterEach, expect, test } from 'vitest'
import { component, signal, type Rendered } from 'jotastic/runtime'
import { cleanup, render, tick } from '@jotastic/test'
import { load } from '../helpers'

afterEach(cleanup)

const source = `
function useCounter(start = 10, { step }: { step: number } = { step: 1 }, ...extra: number[]) {
  let count = start
  return {
    count,
    total: count + extra.reduce((a, b) => a + b, 0),
    step,
    inc: () => (count += step),
  }
}

export function App({ base, k }: { base: number; k: number }) {
  const c = useCounter(base, { step: k }, k, 1)
  const { total } = useCounter(undefined, undefined, base)
  return (
    <div>
      <p>{c.count}|{c.total}|{c.step}|{total}</p>
      <button onClick={c.inc}>+</button>
      <button onClick={() => (c.count = 0)}>0</button>
    </div>
  )
}
`

test('parâmetros lazy, getters/setters e memo de retorno', async () => {
  const m =
    await // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props dos componentes compilados não são tipadas
    load<Record<string, (p: any) => Rendered>>(source, 'App.tsx')
  const k = signal(2)
  const { container } = render(() =>
    component(m.App!, {
      base: 5,
      get k() {
        return k.get()
      },
    }),
  )
  const p = container.querySelector('p')!
  const [inc, zero] = Array.from(container.querySelectorAll('button'))
  // count = 5; total = 5 + (2 + 1); step = 2; o segundo: start default 10, total = 10 + 5
  expect(p.textContent).toBe('5|8|2|15')
  inc!.click()
  await tick()
  expect(p.textContent).toBe('7|10|2|15')
  k.set(3) // step e extra leem o valor atual
  await tick()
  expect(p.textContent).toBe('7|11|3|15')
  inc!.click()
  await tick()
  expect(p.textContent).toBe('10|14|3|15')
  zero!.click() // setter gerado
  await tick()
  expect(p.textContent).toBe('0|4|3|15')
})
