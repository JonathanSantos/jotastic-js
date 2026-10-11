import { template, signal, memo, list, branches, listen, insert } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:4"></div>')
const _t1 = template('<section><h3></h3><!><small></small></section>')
const _t2 = template('<p></p>')
// 18 §8: o callback é um mini-corpo reativo: `let` lido no JSX do item → signal; `const` derivado → memo
export function Accordion(props) {
  const _el = _t0()
  list(
    _el,
    null,
    () => props.items,
    (item, i) => {
      const open = signal(false, {
        name: 'open',
        loc: 'input.tsx:6:13',
      })
      const title = memo(() => `${i() + 1}. ${item.title}`, {
        name: 'title',
        loc: 'input.tsx:7:15',
      })
      const plain = 'x'
      const _el2 = _t1()
      const _h3 = _el2.firstChild
      const _m0 = _h3.nextSibling
      const _small = _m0.nextSibling
      listen(_h3, 'click', () => open.set(!open.get()))
      insert(_h3, () => title.get(), null)
      insert(
        _el2,
        branches([
          [
            () => !!open.get(),
            () => {
              const _el3 = _t2()
              insert(_el3, () => item.body, null)
              return _el3
            },
          ],
        ]),
        _m0,
      )
      insert(_small, () => plain, null)
      return _el2
    },
    (item, i) => item.id,
    {
      loc: 'input.tsx:5:8',
    },
  )
  return _el
}
