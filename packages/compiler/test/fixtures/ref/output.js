import { template, listen } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:8"><input><button></button></div>')
export function Refs() {
  let input
  const track = (el) => console.log(el)
  function focus() {
    input?.focus()
  }
  const _el = _t0()
  const _input = _el.firstChild
  const _button = _input.nextSibling
  track(_el)
  input = _input
  ;((el) => console.log(el))(_button)
  listen(_button, 'click', focus)
  return _el
}
