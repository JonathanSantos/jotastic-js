import { template, resource, continuation, classList, insert, listen } from 'jotastic/runtime'
// 18 §10.1–§10.4, §10.6: `const x = await` → resource + continuation; `pending`/`refresh` reescritos; sem `async`

import { api } from './api'
const _t0 = template('<article data-jo="input.tsx:8"><h2></h2><button>Atualizar</button></article>')
export function UserCard(props) {
  const _r0 = resource(() => api.user(props.id), {
    name: 'user',
    loc: 'input.tsx:6:9',
  })
  return continuation(_r0, () => {
    const _el = _t0()
    const _h2 = _el.firstChild
    const _button = _h2.nextSibling
    classList(_el, () => ({
      dimmed: _r0.pending.get(),
    }))
    insert(_h2, () => _r0.value.get().name, null)
    listen(_button, 'click', () => _r0.refresh())
    return _el
  })
}
