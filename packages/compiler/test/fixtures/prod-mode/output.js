import { template, effect, signal, memo, listen, insert, component } from 'jotastic/runtime'
import { mount } from 'jotastic'
const _t0 = template('<button></button>')
export function Counter(props) {
  const count = signal(0)
  const double = memo(() => count.get() * 2)
  effect(() => console.log(double.get()))
  const _el = _t0()
  listen(_el, 'click', () => count.set(count.get() + (props.step ?? 1)))
  insert(_el, () => count.get(), null)
  return _el
}
mount(
  () =>
    component(Counter, {
      step: 2,
    }),
  '#app',
)
