// [ajuste] Stubs de teste para './components' importado por 04-user-page.js (ErrorBox, Spinner, Tabs não existem na
// spec). Escritos no mesmo estilo da saída compilada.
import { template, insert, classList, listen, list } from 'jotastic/runtime'

const _t0 = template('<p class="error"></p>')
const _t1 = template('<span class="spinner">Carregando…</span>')
const _t2 = template('<nav class="tabs"></nav>')
const _t3 = template('<button></button>')

export function ErrorBox(props) {
  const _el = _t0()
  insert(_el, () => props.message, null)
  return _el
}

export function Spinner() {
  return _t1()
}

export function Tabs(props) {
  const _el = _t2()
  list(
    _el,
    null,
    () => ['posts', 'about'],
    (t) => {
      const _b = _t3()
      classList(_b, () => ({ active: props.value === t }))
      listen(_b, 'click', () => props.onChange(t))
      insert(_b, () => t, null)
      return _b
    },
  )
  return _el
}
