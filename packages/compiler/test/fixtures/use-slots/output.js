import { template, slots, insert } from 'jotastic/runtime'
const _t0 = template('<section data-jo="input.tsx:7"><header></header><div></div><p></p></section>')
// 18 §4: useSlots(children) → slots(props.children); `slots.x` fica como está

export function Panel(props) {
  const s = slots(props.children)
  const _el = _t0()
  const _header = _el.firstChild
  const _div = _header.nextSibling
  const _p = _div.nextSibling
  insert(_header, () => s.header, null)
  insert(_div, () => s.default, null)
  insert(_p, () => s.row?.(1), null)
  return _el
}
