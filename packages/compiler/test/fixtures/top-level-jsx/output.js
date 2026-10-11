import { template, insert, component } from 'jotastic/runtime'
import { mount } from 'jotastic'
import { App } from './App'
const _t0 = template('<h1 class="top">Olá</h1>')
const _t1 = template('<p></p>')
const _t2 = template('<div></div>')
const header = () => {
  const _el = _t0()
  return _el
}
function render(name) {
  return () => {
    const _el = _t1()
    insert(_el, () => name, null)
    return _el
  }
}
mount(
  () =>
    component(
      App,
      {
        title: 'x',
      },
      {
        name: 'App',
        loc: 'input.tsx:10:7',
      },
    ),
  '#app',
  {
    onError: console.error,
  },
)
mount(() => {
  const _el = _t2()
  insert(
    _el,
    component(
      App,
      {},
      {
        name: 'App',
        loc: 'input.tsx:13:5',
      },
    ),
    null,
  )
  return _el
}, document.body)
export { header, render }
