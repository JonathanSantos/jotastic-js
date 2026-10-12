import { template, list, insert, component, branches } from 'jotastic/runtime'
// D64/K-11 (18 §8): lista sem elemento pai fixo (fragmento, children de componente, condicional) → âncora `<!>` num
// fragmento + `list(null, marker, …)`
import { Panel } from './panel'
const _t0 = template('<p></p>')
const _t1 = template('<div><!><!></div>')
const _t2 = template('<b></b>')
const _t3 = template('<hr>')
const _t4 = template('<s></s>')
const _t5 = template('<i></i>')
export function Anchored(props) {
  const _el2 = _t1()
  const _m4 = _el2.firstChild
  const _m5 = _m4.nextSibling
  insert(
    _el2,
    branches([
      [
        () => !!props.open,
        () => {
          const _f2 = document.createDocumentFragment()
          const _m2 = _f2.appendChild(document.createComment(''))
          list(
            null,
            _m2,
            () => props.items,
            (it) => {
              const _el3 = _t2()
              insert(_el3, () => it(), null)
              return _el3
            },
            undefined,
            {
              loc: 'input.tsx:17:18',
            },
          )
          return _f2
        },
      ],
    ]),
    _m4,
  )
  insert(
    _el2,
    branches(
      [
        [
          () => !!props.open,
          () => {
            const _el4 = _t3()
            return _el4
          },
        ],
      ],
      () => {
        const _f3 = document.createDocumentFragment()
        const _m3 = _f3.appendChild(document.createComment(''))
        list(
          null,
          _m3,
          () => props.items,
          (it) => {
            const _el5 = _t4()
            insert(_el5, () => it(), null)
            return _el5
          },
          undefined,
          {
            loc: 'input.tsx:18:26',
          },
        )
        return _f3
      },
    ),
    _m5,
  )
  return [
    () => {
      const _f0 = document.createDocumentFragment()
      const _m0 = _f0.appendChild(document.createComment(''))
      list(
        null,
        _m0,
        () => props.items,
        (it) => {
          const _el = _t0()
          insert(_el, () => it(), null)
          return _el
        },
        undefined,
        {
          loc: 'input.tsx:8:8',
        },
      )
      return _f0
    },
    component(
      Panel,
      {
        children: () => {
          const _f1 = document.createDocumentFragment()
          const _m1 = _f1.appendChild(document.createComment(''))
          list(
            null,
            _m1,
            () => props.items,
            (it, i) => {
              const _el6 = _t5()
              insert(_el6, () => i(), null)
              return _el6
            },
            (it, i) => it,
            {
              loc: 'input.tsx:12:10',
            },
          )
          return _f1
        },
      },
      {
        name: 'Panel',
        loc: 'input.tsx:11:7',
      },
    ),
    _el2,
  ]
}
