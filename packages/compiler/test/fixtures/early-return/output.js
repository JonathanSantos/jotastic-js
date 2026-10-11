import { template, signal, memo, branches, insert, component, listen } from 'jotastic/runtime'
// 18 §9: if/return → branches; setup antes, continuação depois (com estado próprio: continuation-state-resets)
import { Spinner } from './spinner'
const _t0 = template('<p data-jo="input.tsx:6" class="error"></p>')
const _t1 = template('<div data-jo="input.tsx:11"><h1></h1><button></button><span></span></div>')
export function UserPage(props) {
  const clicks = signal(0, {
    name: 'clicks',
    loc: 'input.tsx:5:7',
  })
  return branches(
    [
      [
        () => !!props.user.error,
        () => {
          const _el = _t0()
          insert(_el, () => props.user.error.message, null)
          return _el
        },
      ],
      [
        () => !props.user.data,
        () =>
          component(
            Spinner,
            {},
            {
              name: 'Spinner',
              loc: 'input.tsx:7:26',
            },
          ),
      ],
    ],
    () => {
      const tab = signal('posts', {
        name: 'tab',
        loc: 'input.tsx:8:7',
      })
      const fullName = memo(() => `${props.user.data.first} ${props.user.data.last}`, {
        name: 'fullName',
        loc: 'input.tsx:9:9',
      })
      const _el2 = _t1()
      const _h1 = _el2.firstChild
      const _button = _h1.nextSibling
      const _span = _button.nextSibling
      insert(_h1, () => fullName.get(), null)
      listen(_button, 'click', () => tab.set(tab.get() === 'posts' ? 'about' : 'posts'))
      insert(_button, () => tab.get(), null)
      insert(_span, () => clicks.get(), null)
      return _el2
    },
  )
}
