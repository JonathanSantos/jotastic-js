import { template, component } from 'jotastic/runtime'
import { Child } from './lib'
const _t0 = template('<h1>titulo</h1>')
const _t1 = template('<p>só um</p>')
export function Frag(props) {
  const _el = _t0()
  return [
    _el,
    'texto',
    () => props.a,
    component(
      Child,
      {},
      {
        name: 'Child',
        loc: 'input.tsx:9:7',
      },
    ),
  ]
}
export function Single() {
  const _el = _t1()
  return _el
}
