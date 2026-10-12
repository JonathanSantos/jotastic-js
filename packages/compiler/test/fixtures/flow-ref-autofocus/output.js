import { template, branches, insert, list, onCleanup, autofocus, prop } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:6"><input autofocus><!><ul></ul></div>')
const _t1 = template('<input autofocus>')
const _t2 = template('<li><input autofocus readonly></li>')
// 18 §5.3/§5.6: dentro de branch/item/continuação, `ref` ganha onCleanup e `autofocus` ganha autofocus(el)
export function Editor(props) {
  let input
  let box
  const _el = _t0()
  const _m0 = _el.firstChild.nextSibling
  const _ul = _m0.nextSibling
  box = _el
  insert(
    _el,
    branches([
      [
        () => !!props.editing,
        () => {
          const _el2 = _t1()
          input = _el2
          onCleanup(() => (input = undefined))
          autofocus(_el2)
          return _el2
        },
      ],
    ]),
    _m0,
  )
  list(
    _ul,
    null,
    () => props.items,
    (x) => {
      const _el3 = _t2()
      const _input = _el3.firstChild
      prop(_input, 'value', () => x())
      autofocus(_input)
      return _el3
    },
    undefined,
    {
      loc: 'input.tsx:10:10',
    },
  )
  return _el
}
