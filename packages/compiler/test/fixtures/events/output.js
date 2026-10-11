import { template, listen } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:6"><input></div>')
export function Events() {
  function onKey(e) {
    console.log(e.key)
  }
  const _el = _t0()
  const _input = _el.firstChild
  listen(_el, 'dblclick', () => console.log('dbl'))
  listen(_el, 'scroll', onKey, {
    capture: true,
  })
  listen(_el, 'item-selected', (e) => console.log(e))
  listen(_input, 'keydown', onKey)
  listen(_input, 'mouseenter', onKey)
  return _el
}
