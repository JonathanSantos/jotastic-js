import { template, signal, resource, continuation, classList, listen, insert } from 'jotastic/runtime'
// 18 §10.1 (W-5): `const x = f(await e)` / `(await e).y` → o `await` é içado para `_rN`; `x` lido como o
// inicializador com `_rN.value.get()` no lugar do `await`

import { api } from './api'
const _t0 = template('<p data-jo="input.tsx:11"><!> <!></p>')
export function Count(props) {
  const page = signal(1, {
    name: 'page',
    loc: 'input.tsx:7:7',
  })
  const _r0 = resource(() => api.search(props.q, page.get()), {
    name: 'n',
    loc: 'input.tsx:8:9',
  })
  return continuation(_r0, () => {
    const _r1 = resource(() => api.user(props.q), {
      name: 'label',
      loc: 'input.tsx:9:9',
    })
    return continuation(_r1, () => {
      const _el = _t0()
      const _m0 = _el.firstChild
      const _m1 = _m0.nextSibling.nextSibling
      classList(_el, () => ({
        dimmed: _r0.pending.get(),
      }))
      listen(_el, 'click', () => page.set(page.get() + 1))
      insert(_el, () => _r0.value.get().length, _m0)
      insert(_el, () => format(_r1.value.get(), page.get()), _m1)
      return _el
    })
  })
}
function format(u, page) {
  return `${u.name} (${page})`
}
