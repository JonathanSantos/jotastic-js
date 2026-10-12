import { template, signal, state, memo, insert, text, list, listen } from 'jotastic/runtime'
const _t0 = template(
  '<section data-jo="input.tsx:9"><h2></h2><p><!> <!> <!> <!> <!> <!></p><p><!> <!> <!> <!> <!> <!></p><ul></ul></section>',
)
const _t1 = template('<li><!> / <!></li>')
// D64 (18 §5.1): `{expr}` escalar com marcador → `text(marker, read)`; o resto → `insert`. Conteúdo único → `insert`
export function Scalars(props) {
  const count = signal(0, {
    name: 'count',
    loc: 'input.tsx:3:7',
  })
  const user = state(
    {
      name: 'a',
    },
    {
      name: 'user',
      loc: 'input.tsx:4:7',
    },
  )
  const double = memo(() => count.get() * 2, {
    name: 'double',
    loc: 'input.tsx:5:9',
  })
  const name = memo(() => user.get().name, {
    name: 'name',
    loc: 'input.tsx:6:9',
  })
  const big = memo(() => double.get() > 10, {
    name: 'big',
    loc: 'input.tsx:7:9',
  })
  const _el = _t0()
  const _h2 = _el.firstChild
  const _p = _h2.nextSibling
  const _m0 = _p.firstChild
  const _m1 = _m0.nextSibling.nextSibling
  const _m2 = _m1.nextSibling.nextSibling
  const _m3 = _m2.nextSibling.nextSibling
  const _m4 = _m3.nextSibling.nextSibling
  const _m5 = _m4.nextSibling.nextSibling
  const _p2 = _p.nextSibling
  const _m6 = _p2.firstChild
  const _m7 = _m6.nextSibling.nextSibling
  const _m8 = _m7.nextSibling.nextSibling
  const _m9 = _m8.nextSibling.nextSibling
  const _m10 = _m9.nextSibling.nextSibling
  const _m11 = _m10.nextSibling.nextSibling
  const _ul = _p2.nextSibling
  insert(_h2, () => props.title, null)
  text(_m0, () => count.get())
  text(_m1, () => double.get())
  text(_m2, () => props.step ?? 1)
  text(_m3, () => (big.get() ? 'grande' : 'pequeno'))
  text(_m4, () => `#${count.get()}`)
  text(_m5, () => count.get() && 'x')
  insert(_p2, () => props.title, _m6)
  insert(_p2, () => name.get(), _m7)
  insert(_p2, () => props.icon ?? 'nenhum', _m8)
  text(_m9, () => user.get().name.length)
  text(_m10, () => big.get() || '-')
  insert(_p2, () => user.get().name, _m11)
  list(
    _ul,
    null,
    () => [1, 2],
    (n) => {
      const hits = signal(0, {
        name: 'hits',
        loc: 'input.tsx:19:15',
      })
      const _el2 = _t1()
      const _m12 = _el2.firstChild
      const _m13 = _m12.nextSibling.nextSibling
      listen(_el2, 'click', () => hits.set(hits.get() + 1))
      text(_m12, () => hits.get())
      insert(_el2, () => n(), _m13)
      return _el2
    },
    undefined,
    {
      loc: 'input.tsx:18:10',
    },
  )
  return _el
}
