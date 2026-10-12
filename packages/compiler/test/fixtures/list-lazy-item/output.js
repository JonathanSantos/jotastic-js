import { template, memo, list, listen, prop, twoWay, insert, classList } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:6"><ul></ul><ol></ol></div>')
const _t1 = template('<li><input type="checkbox"><button></button></li>')
const _t2 = template('<li></li>')
// D58 (18 §4/§8): o item é lazy: leituras `item()`, escrita `item().x = v`, desestruturação `({ name }) =>` → `item().name`

export function Items(props) {
  const _el = _t0()
  const _ul = _el.firstChild
  const _ol = _ul.nextSibling
  list(
    _ul,
    null,
    () => props.todos,
    (todo) => {
      const _el2 = _t1()
      const _input = _el2.firstChild
      const _button = _input.nextSibling
      listen(_el2, 'click', () => props.onPick(todo()))
      prop(_input, 'checked', () => todo().done)
      twoWay(_input, 'checked', (v) => (todo().done = v))
      listen(_button, 'click', () => (todo().done = !todo().done))
      insert(_button, () => todo().text, null)
      return _el2
    },
    (todo) => todo.id,
    {
      loc: 'input.tsx:8:10',
    },
  )
  list(
    _ol,
    null,
    () => props.todos,
    (item) => {
      const label = memo(() => `${item().id}: ${item().text}`, {
        name: 'label',
        loc: 'input.tsx:17:17',
      })
      const _el3 = _t2()
      classList(_el3, () => ({
        done: item().done ?? false,
      }))
      listen(_el3, 'click', () => (item().text = item().text + '!'))
      insert(_el3, () => label.get(), null)
      return _el3
    },
    (item) => item.id,
    {
      loc: 'input.tsx:16:10',
    },
  )
  return _el
}
