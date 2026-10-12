import { template, insert, branches, component, list } from 'jotastic/runtime'
// K-14: filho único condicional de componente → `get children() { return branches(…) }`; K-11/D64 (lista) → âncora + `list(null, …)`
import { Card } from './card'
const _t0 = template('<div data-jo="input.tsx:6"><!><!><!></div>')
const _t1 = template('<p></p>')
const _t2 = template('<b></b>')
const _t3 = template('<i></i>')
export function A(props) {
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling
  const _m2 = _m1.nextSibling
  insert(
    _el,
    component(
      Card,
      {
        get children() {
          return branches([
            [
              () => props.x > 0,
              () => {
                const _el2 = _t1()
                insert(_el2, () => props.x, null)
                return _el2
              },
            ],
          ])
        },
      },
      {
        name: 'Card',
        loc: 'input.tsx:7:7',
      },
    ),
    _m0,
  )
  insert(
    _el,
    component(
      Card,
      {
        get children() {
          return branches(
            [
              [
                () => !!props.x,
                () => {
                  const _el3 = _t2()
                  return _el3
                },
              ],
            ],
            () => 'nada',
          )
        },
      },
      {
        name: 'Card',
        loc: 'input.tsx:8:7',
      },
    ),
    _m1,
  )
  insert(
    _el,
    component(
      Card,
      {
        children: () => {
          const _f0 = document.createDocumentFragment()
          const _m3 = _f0.appendChild(document.createComment(''))
          list(
            null,
            _m3,
            () => props.items,
            (i) => {
              const _el4 = _t3()
              insert(_el4, () => i(), null)
              return _el4
            },
            undefined,
            {
              loc: 'input.tsx:9:14',
            },
          )
          return _f0
        },
      },
      {
        name: 'Card',
        loc: 'input.tsx:9:7',
      },
    ),
    _m2,
  )
  return _el
}
