import { template, SLOTS, component, onCleanup, listen } from 'jotastic/runtime'
// 18 §12 + X-8: 2+ filhos fora de <Slot> (default vira arrow com bloco) junto de um <Slot>.
// X-9: `ref` dentro de children/slot de componente ganha onCleanup (quem recebe decide quando os nós morrem).

import { M } from './m'
const _t0 = template('<p>a</p>')
const _t1 = template('<input>')
const _t2 = template('<b></b>')
const _t3 = template('<i></i>')
export function A() {
  let input
  return component(
    M,
    {
      children: {
        [SLOTS]: true,
        default: () => {
          const _el = _t0()
          const _el2 = _t1()
          input = _el2
          onCleanup(() => (input = undefined))
          return [_el, _el2]
        },
        actions: () => {
          const _el3 = _t2()
          listen(_el3, 'click', () => input?.focus())
          return _el3
        },
      },
    },
    {
      name: 'M',
      loc: 'input.tsx:9:5',
    },
  )
}
export function B() {
  return component(
    M,
    {
      children: {
        [SLOTS]: true,
        default: () => {
          const _el = _t0()
          const _el2 = _t3()
          return [_el, _el2]
        },
        actions: () => {
          const _el3 = _t2()
          return _el3
        },
      },
    },
    {
      name: 'M',
      loc: 'input.tsx:19:5',
    },
  )
}
