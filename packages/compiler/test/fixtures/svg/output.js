import { template, attr } from 'jotastic/runtime'
const _t0 = template(
  '<svg data-jo="input.tsx:3" viewBox="0 0 24 24"><path d="M0 0"></path><foreignObject><div class="x"></div></foreignObject></svg>',
  true,
)
const _t1 = template('<circle data-jo="input.tsx:13"></circle>', true)
export function Icon(props) {
  const _el = _t0()
  const _path = _el.firstChild
  attr(_el, 'width', () => props.size)
  attr(_path, 'stroke-width', () => props.size)
  return _el
}
export function Shape(props) {
  const _el = _t1()
  attr(_el, 'r', () => props.r)
  return _el
}
