import { template, state, SLOTS, component, insert, listen } from 'jotastic/runtime'
// 18 §12: <Slot name> nos children de componente → objeto de slots

import { Card } from './card'
const _t0 = template('<p>Corpo</p>')
const _t1 = template('<h2>Título <!></h2>')
const _t2 = template('<b></b>')
const _t3 = template('<button>Excluir</button>')
export function Page(props) {
  const selected = state(0, {
    name: 'selected',
    loc: 'input.tsx:6:7',
  })
  return component(
    Card,
    {
      children: {
        [SLOTS]: true,
        default: () => {
          const _el = _t0()
          return _el
        },
        header: () => {
          const _el2 = _t1()
          const _m0 = _el2.firstChild.nextSibling
          insert(_el2, () => props.n, _m0)
          return _el2
        },
        row: (item) => {
          const _el3 = _t2()
          listen(_el3, 'click', () => selected.set(item))
          insert(_el3, () => item, null)
          return _el3
        },
        get footer() {
          return props.admin
            ? () => {
                const _el4 = _t3()
                return _el4
              }
            : undefined
        },
        aside: () => 'fixo',
        get badge() {
          return props.n > 1 ? () => 'muitos' : !(props.n > 1) ? () => 'um' : undefined
        },
        get hint() {
          return !props.admin ? () => selected.get() : undefined
        },
      },
    },
    {
      name: 'Card',
      loc: 'input.tsx:8:5',
    },
  )
}
export function OnlySlots() {
  return component(
    Card,
    {
      children: {
        [SLOTS]: true,
        default: () => null,
        header: () => 'só cabeçalho',
      },
    },
    {
      name: 'Card',
      loc: 'input.tsx:30:5',
    },
  )
}
