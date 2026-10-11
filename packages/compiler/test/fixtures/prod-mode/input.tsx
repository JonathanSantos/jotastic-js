import { watch, inspect, mount } from 'jotastic'

export function Counter({ step = 1 }: { step?: number }) {
  let count = 0
  const double = count * 2
  watch(() => console.log(double))
  inspect(count)
  return <button onClick={() => (count += step)}>{count}</button>
}

mount(<Counter step={2} />, '#app')
