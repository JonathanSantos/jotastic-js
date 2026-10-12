import { template, memo, list, classList, insert, listen, text } from 'jotastic/runtime'
const _t0 = template('<section data-jo="input.tsx:6"><ul></ul><ol><li>primeiro</li><!></ol><p></p></section>')
const _t1 = template('<li></li>')
const _t2 = template('<li><!>. <!></li>')
const _t3 = template('<span></span>')
// 18 §8: `.map` com JSX em filho de elemento → list(parent, marker, source, render, key?, dev)

export function Lists(props) {
  const _el = _t0()
  const _ul = _el.firstChild
  const _ol = _ul.nextSibling
  const _m0 = _ol.firstChild.nextSibling
  const _p = _ol.nextSibling
  list(
    _ul,
    null,
    () => props.rows,
    (r) => {
      const _el2 = _t1()
      classList(_el2, () => ({
        done: r().done,
      }))
      insert(_el2, () => r().name, null)
      return _el2
    },
    undefined,
    {
      loc: 'input.tsx:8:10',
    },
  )
  list(
    _ol,
    _m0,
    () => props.rows.filter((r) => !r.done),
    (r, i) => {
      const _el3 = _t2()
      const _m1 = _el3.firstChild
      const _m2 = _m1.nextSibling.nextSibling
      listen(_el3, 'click', () => console.log(i()))
      text(_m1, () => i() + 1)
      insert(_el3, () => r().name, _m2)
      return _el3
    },
    (r, i) => r.name + i,
    {
      loc: 'input.tsx:14:10',
    },
  )
  list(
    _p,
    null,
    () => props.tags,
    (tag) => {
      const upper = memo(() => tag().toUpperCase(), {
        name: 'upper',
        loc: 'input.tsx:22:17',
      })
      const _el4 = _t3()
      insert(_el4, () => upper.get(), null)
      return _el4
    },
    (tag) => tag,
    {
      loc: 'input.tsx:21:10',
    },
  )
  return _el
}
