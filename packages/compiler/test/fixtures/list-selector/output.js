import {
  template,
  state,
  memo,
  selector,
  list,
  branches,
  classList,
  bool,
  attr,
  insert,
  listen,
} from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:9"><table><tbody></tbody></table><ul></ul></div>')
const _t1 = template('<tr><td></td><td></td><td></td></tr>')
const _t2 = template('<b>raiz</b>')
const _t3 = template('<li></li>')
// D63 (18 §8): `A === B` / `!==` / `Object.is` na linha, um lado só de fora (reativo) e o outro do item →
// `const _selN = selector(() => A)` antes do `list` e `_selN(B)` na linha

export function Table(props) {
  const selected = state(0, {
    name: 'selected',
    loc: 'input.tsx:6:7',
  })
  const LIMIT = 10
  const _el = _t0()
  const _table = _el.firstChild
  const _tbody = _table.firstChild
  const _ul = _table.nextSibling
  const _sel0 = selector(() => selected.get())
  const _sel1 = selector(() => props.current)
  list(
    _tbody,
    null,
    () => props.rows,
    (row) => {
      const _el2 = _t1()
      const _td = _el2.firstChild
      const _td2 = _td.nextSibling
      const _td3 = _td2.nextSibling
      classList(_el2, () => (_sel0(row().id) ? 'danger' : ''))
      bool(_el2, 'hidden', () => !_sel0(row().id))
      attr(_td, 'aria-current', () => _sel1(row().parent))
      insert(_td, () => row().label, null)
      listen(_td2, 'click', () => selected.set(row().id))
      insert(_td2, () => (row().id === LIMIT ? 'limite' : ''), null)
      insert(
        _td3,
        branches([
          [
            () => row().parent === row().id,
            () => {
              const _el3 = _t2()
              return _el3
            },
          ],
        ]),
        null,
      )
      return _el2
    },
    undefined,
    {
      loc: 'input.tsx:12:12',
    },
  )
  const _sel2 = selector(() => selected.get())
  list(
    _ul,
    null,
    () => props.rows,
    (row) => {
      const active = memo(() => _sel2(row().id), {
        name: 'active',
        loc: 'input.tsx:23:17',
      })
      const _el4 = _t3()
      classList(_el4, () => ({
        active: active.get(),
      }))
      insert(_el4, () => (active.get() ? 'sim' : 'não'), null)
      return _el4
    },
    undefined,
    {
      loc: 'input.tsx:22:10',
    },
  )
  return _el
}
