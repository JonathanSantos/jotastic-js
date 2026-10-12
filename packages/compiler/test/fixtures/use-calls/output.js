import { template, _void, state, memo, signal, listen, insert } from 'jotastic/runtime'
// 18 §4/§11: useX(a, b) → useX(() => a', () => b'); `const u = useX()` (useResult) lido como `u.x`
import { useImported } from './lib'
const _t0 = template('<p data-jo="input.tsx:21"><!> <!> <!> <!></p>')
function useLocal(a = _void, b = _void) {
  const n = state(a(), {
    name: 'n',
    loc: 'input.tsx:5:7',
  })
  return {
    get n() {
      return n.get()
    },
    set n(v) {
      n.set(v)
    },
    get b() {
      return b()
    },
  }
}
function useOuter(q = _void) {
  const inner = useLocal(() => q().length)
  const _value = memo(() => inner.n, {
    name: 'value',
    loc: 'input.tsx:11:19',
  })
  return {
    get value() {
      return _value.get()
    },
  }
}
export function Comp(props) {
  const query = signal('', {
    name: 'query',
    loc: 'input.tsx:15:7',
  })
  const local = useLocal(() => props.step * 2)
  const _n = useLocal(
    () => 1,
    () => query.get(),
  )
  const outer = useOuter(() => query.get())
  const ext = useImported(
    () => `/api?q=${query.get()}`,
    () => () => query.set(''),
  )
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling.nextSibling
  const _m2 = _m1.nextSibling.nextSibling
  const _m3 = _m2.nextSibling.nextSibling
  listen(_el, 'click', () => (local.n = 0))
  insert(_el, () => local.n, _m0)
  insert(_el, () => _n.n, _m1)
  insert(_el, () => outer.value, _m2)
  insert(_el, () => ext.data, _m3)
  return _el
}
