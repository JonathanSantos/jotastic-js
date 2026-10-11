import { template, resource, continuation, insert } from 'jotastic/runtime'
// 18 §10.4–§10.5: `await` sem declarador (só espera) e `const [a, b] = await Promise.all(…)` → um recurso
import { api } from './api'
const _t0 = template('<p data-jo="input.tsx:8"><!>: <!></p>')
export function Dash() {
  const _r0 = resource(() => api.ready(), {
    loc: 'input.tsx:5:3',
  })
  return continuation(_r0, () => {
    const _r1 = resource(() => Promise.all([api.user(), api.meta()]), {
      name: 'user, tags',
      loc: 'input.tsx:6:9',
    })
    return continuation(_r1, () => {
      const _el = _t0()
      const _m0 = _el.firstChild
      const _m1 = _m0.nextSibling.nextSibling
      insert(_el, () => _r1.value.get()[0].name, _m0)
      insert(_el, () => (_r1.value.get()[1].tags ?? []).length, _m1)
      return _el
    })
  })
}
