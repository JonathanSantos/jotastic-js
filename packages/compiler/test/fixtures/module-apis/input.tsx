import { watch, on, external, inspect, onMount, onCleanup, untrack } from 'jotastic'
import { Chart } from './chart'

export function Apis() {
  let count = 0
  let el: HTMLCanvasElement | undefined
  const chart = external(
    () => new Chart(el!),
    (c) => c.update(count),
  )
  watch(() => console.log(count))
  on(window, 'resize', () => count++)
  inspect(count)
  onMount(() => console.log('mounted', untrack(() => count)))
  onCleanup(() => console.log('bye'))
  return (
    <canvas ref={el} onClick={() => chart.reset()}>
      {count}
    </canvas>
  )
}
