import { template, SLOTS, component } from 'jotastic/runtime'
// 18 §12 (U-3): `{x ? <Slot name="h"/> : <i/>}` → `h` e `default` com getters condicionais complementares

import { Panel } from './panel'
const _t0 = template('<i>sem título</i>')
const _t1 = template('<h1>Título</h1>')
const _t2 = template('<p>vazio</p>')
export function Page(props) {
  return component(
    Panel,
    {
      children: {
        [SLOTS]: true,
        get default() {
          return props.titled
            ? () => null
            : () => {
                const _el = _t0()
                return _el
              }
        },
        get head() {
          return props.titled
            ? () => {
                const _el2 = _t1()
                return _el2
              }
            : undefined
        },
      },
    },
    {
      name: 'Panel',
      loc: 'input.tsx:6:10',
    },
  )
}
export function Inverse(props) {
  return component(
    Panel,
    {
      children: {
        [SLOTS]: true,
        get default() {
          return props.empty
            ? () => {
                const _el = _t2()
                return _el
              }
            : () => null
        },
        get head() {
          return !props.empty ? () => 'cheio' : undefined
        },
      },
    },
    {
      name: 'Panel',
      loc: 'input.tsx:10:10',
    },
  )
}
