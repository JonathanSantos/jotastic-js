import { template, external, effect, on, inspect, signal, listen, insert } from 'jotastic/runtime'
import { onMount, onCleanup, untrack } from 'jotastic'
import { Chart } from './chart'
const _t0 = template('<canvas data-jo="input.tsx:17"></canvas>')
export function Apis() {
  const count = signal(0, {
    name: 'count',
    loc: 'input.tsx:5:7',
  })
  let el
  const chart = external(
    () => new Chart(el),
    (c) => c.update(count.get()),
    undefined,
    {
      name: 'chart',
      loc: 'input.tsx:7:17',
    },
  )
  effect(() => console.log(count.get()), {
    name: 'watch',
    loc: 'input.tsx:11:3',
  })
  on(
    () => window,
    'resize',
    () => count.set(count.get() + 1),
  )
  inspect(
    {
      name: 'count',
      loc: 'input.tsx:13:3',
    },
    () => count.get(),
  )
  onMount(() =>
    console.log(
      'mounted',
      untrack(() => count.get()),
    ),
  )
  onCleanup(() => console.log('bye'))
  const _el = _t0()
  el = _el
  listen(_el, 'click', () => chart.get().reset())
  insert(_el, () => count.get(), null)
  return _el
}
