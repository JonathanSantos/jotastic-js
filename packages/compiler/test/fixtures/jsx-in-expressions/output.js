import { template, signal, insert, component } from 'jotastic/runtime'
import { Child } from './lib'
const _t0 = template('<em></em>')
const _t1 = template('<u></u>')
const _t2 = template('<div data-jo="input.tsx:11"><!><!><!></div>')
const _t3 = template('<b></b>')
const _t4 = template('<i></i>')
const _t5 = template('<a></a>')
export function Nested(props) {
  const n = signal(0, {
    name: 'n',
    loc: 'input.tsx:4:7',
  })
  const make = () => {
    const _el = _t0()
    insert(_el, () => n.get(), null)
    return _el
  }
  function build() {
    const _el2 = _t1()
    insert(_el2, () => n.get(), null)
    const node = _el2
    return node
  }
  const _el3 = _t2()
  const _m0 = _el3.firstChild
  const _m1 = _m0.nextSibling
  const _m2 = _m1.nextSibling
  insert(
    _el3,
    component(
      Child,
      {
        get icon() {
          let _el4
          return props.ok ? ((_el4 = _t3()), insert(_el4, () => n.get(), null), _el4) : null
        },
        render: () => {
          const _el5 = _t4()
          insert(_el5, () => n.get(), null)
          return _el5
        },
      },
      {
        name: 'Child',
        loc: 'input.tsx:12:7',
      },
    ),
    _m0,
  )
  insert(
    _el3,
    component(
      Child,
      {
        get items() {
          const _el6 = _t5()
          const _el7 = _t5()
          return [_el6, _el7]
        },
      },
      {
        name: 'Child',
        loc: 'input.tsx:13:7',
      },
    ),
    _m1,
  )
  insert(_el3, () => [make(), build()], _m2)
  return _el3
}
