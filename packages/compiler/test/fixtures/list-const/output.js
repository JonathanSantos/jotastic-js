import { template, list, insert } from 'jotastic/runtime'
const _t0 = template('<tr><td></td></tr>')
const _t1 = template('<table data-jo="input.tsx:5"><thead><tr><th>Nome</th></tr></thead><tbody></tbody></table>')
// 18 §8: `const rows = items.map(…)` → função `(parent, marker) => list(…)`, `{rows}` → `_rows(parent, marker)`
export function Table(props) {
  const _rows = (parent, marker) =>
    list(
      parent,
      marker,
      () => props.items,
      (item) => {
        const _el = _t0()
        const _td = _el.firstChild
        insert(_td, () => item.label, null)
        return _el
      },
      undefined,
      {
        name: 'rows',
        loc: 'input.tsx:3:9',
      },
    )
  const _el2 = _t1()
  const _tbody = _el2.firstChild.nextSibling
  _rows(_tbody, null)
  return _el2
}
