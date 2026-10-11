import { template, insert } from 'jotastic/runtime'
const _t0 = template(
  '<div data-jo="input.tsx:3"><p></p><p><!><!></p><p>x <!> y <!></p><p></p><ul><li>fixo</li><li></li></ul></div>',
)
export function Markers(props) {
  const _el = _t0()
  const _p = _el.firstChild
  const _p2 = _p.nextSibling
  const _m0 = _p2.firstChild
  const _m1 = _m0.nextSibling
  const _p3 = _p2.nextSibling
  const _m2 = _p3.firstChild.nextSibling
  const _m3 = _m2.nextSibling.nextSibling
  const _p4 = _p3.nextSibling
  const _ul = _p4.nextSibling
  const _li = _ul.firstChild.nextSibling
  insert(_p, () => props.a, null)
  insert(_p2, () => props.a, _m0)
  insert(_p2, () => props.b, _m1)
  insert(_p3, () => props.a, _m2)
  insert(_p3, () => props.b, _m3)
  insert(_p4, () => props.a, null)
  insert(_li, () => props.b, null)
  return _el
}
