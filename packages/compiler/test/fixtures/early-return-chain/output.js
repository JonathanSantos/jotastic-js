import { template, branches, memo, insert } from 'jotastic/runtime'
const _t0 = template('<b data-jo="input.tsx:5" class="bad"></b>')
const _t1 = template('<span data-jo="input.tsx:10"></span>')
const _t2 = template('<p data-jo="input.tsx:15">a</p>')
const _t3 = template('<p data-jo="input.tsx:17">b</p>')
const _t4 = template('<p data-jo="input.tsx:18"></p>')
// 18 §9: else if / else → casos + fallback; prelude dentro do render do caso; `return` de não-JSX
export function Badge(props) {
  return branches(
    [
      [
        () => props.n < 0,
        () => {
          const msg = `inválido: ${props.n}`
          const _el = _t0()
          insert(_el, () => msg, null)
          return _el
        },
      ],
      [() => props.n === 0, () => null],
      [() => props.n > 99, () => '99+'],
    ],
    () => {
      console.log('render')
      const _el2 = _t1()
      insert(_el2, () => props.label, null)
      return _el2
    },
  )
}
export function Nested(props) {
  return branches(
    [
      [
        () => !!props.a,
        () => {
          const _el = _t2()
          return _el
        },
      ],
    ],
    () => {
      const x = memo(() => (props.b ? 1 : 2), {
        name: 'x',
        loc: 'input.tsx:16:9',
      })
      return branches(
        [
          [
            () => !!props.b,
            () => {
              const _el2 = _t3()
              return _el2
            },
          ],
        ],
        () => {
          const _el3 = _t4()
          insert(_el3, () => x.get(), null)
          return _el3
        },
      )
    },
  )
}
