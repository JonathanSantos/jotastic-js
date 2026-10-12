import { template, memo, classList, insert } from 'jotastic/runtime'
// I-3 (22): `const t = useContext(Ctx)` é reativo via o `const` que o recebe → `memo(() => useContext(Ctx))`
import { createContext, useContext } from 'jotastic'
const _t0 = template('<p data-jo="input.tsx:10"></p>')
const Theme = createContext({
  color: 'light',
})
export function Label() {
  const theme = memo(() => useContext(Theme), {
    name: 'theme',
    loc: 'input.tsx:7:9',
  })
  const _color = memo(() => useContext(Theme), {
    name: 'color',
    loc: 'input.tsx:8:9',
  })
  const _el = _t0()
  classList(_el, () => theme.get().color)
  insert(_el, () => _color.get().color, null)
  return _el
}
