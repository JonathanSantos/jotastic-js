import { template, resource, continuation, prop, listen } from 'jotastic/runtime'
// 18 §10.3 (D36): `let x = await` → `x = v` vira `_r0.value.set(v)`; `x.campo = v` passa pelo proxy
import { api } from './api'
const _t0 = template('<div data-jo="input.tsx:16"><input><button>limpar</button></div>')
export function Profile(props) {
  const _r0 = resource(() => api.user(props.id), {
    name: 'user',
    loc: 'input.tsx:5:7',
  })
  return continuation(_r0, () => {
    async function rename(name) {
      const previous = _r0.value.get().name
      _r0.value.get().name = name
      try {
        await api.rename(props.id, name)
      } catch {
        _r0.value.get().name = previous
      }
    }
    const _el = _t0()
    const _input = _el.firstChild
    const _button = _input.nextSibling
    prop(_input, 'value', () => _r0.value.get().name)
    listen(_input, 'change', (e) => rename(e.currentTarget.value))
    listen(_button, 'click', () =>
      _r0.value.set({
        id: props.id,
        name: '',
      }),
    )
    return _el
  })
}
