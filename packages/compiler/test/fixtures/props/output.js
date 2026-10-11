import { template, rest, classList, listen, spread, insert } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:6"><!> <!></div>')
const _t1 = template('<h1 data-jo="input.tsx:13"></h1>')
const _t2 = template('<b data-jo="input.tsx:16"></b>')
const _t3 = template('<i data-jo="input.tsx:20"></i>')
export function Destructured(props) {
  const _others = rest(props, ['title', 'size', 'user'])
  function rename() {
    props.title = 'novo'
  }
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling.nextSibling
  classList(_el, () => props.size ?? 'md')
  listen(_el, 'click', rename)
  spread(_el, () => _others)
  insert(_el, () => props.title, _m0)
  insert(_el, () => props.user.name, _m1)
  return _el
}
export function PropsObject(props) {
  const _el = _t1()
  insert(_el, () => props.title, null)
  return _el
}
export const Arrow = (props) => {
  const _el = _t2()
  insert(_el, () => props.label, null)
  return _el
}
export function Shadow(props) {
  const f = (value) => value + 1
  const _el = _t3()
  insert(_el, () => f(props.value), null)
  return _el
}
