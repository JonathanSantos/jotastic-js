import { template, insert } from 'jotastic/runtime'
const _t0 = template('<span>dentro</span>')
const _t1 = template('<article data-jo="input.tsx:4"></article>')
export function Card() {
  const _el = _t0()
  const inner = _el
  const _el2 = _t1()
  insert(_el2, () => inner, null)
  return _el2
}
