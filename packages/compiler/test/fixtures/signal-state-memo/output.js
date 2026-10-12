import { template, signal, state, memo, listen, text, insert } from 'jotastic/runtime'
const _t0 = template('<p data-jo="input.tsx:33"><!> <!> <!> <!> <!> <!></p>')
export function Rewrites() {
  const count = signal(0, {
    name: 'count',
    loc: 'input.tsx:2:7',
  })
  const user = state(null, {
    name: 'user',
    loc: 'input.tsx:3:7',
  })
  const items = state([], {
    name: 'items',
    loc: 'input.tsx:4:7',
  })
  const name = signal('a', {
    name: 'name',
    loc: 'input.tsx:5:7',
  })
  const a = state(1, {
    name: 'a',
    loc: 'input.tsx:6:7',
  })
  const b = state(2, {
    name: 'b',
    loc: 'input.tsx:7:7',
  })
  let handlerOnly = 0
  const total = memo(() => count.get() + items.get().length, {
    name: 'total',
    loc: 'input.tsx:9:9',
  })
  const label = memo(() => name.get().toUpperCase(), {
    name: 'label',
    loc: 'input.tsx:10:9',
  })
  function mutate() {
    count.set(count.get() + 1)
    count.set(count.get() + 1)
    count.set(count.get() - 1)
    count.set(count.get() + 2)
    count.set(count.get() * 3)
    name.set(name.get() || 'x')
    name.set(name.get() ?? 'y')
    const old = (count.set(count.get() + 1), count.get() - 1)
    const now = (count.set(count.get() + 1), count.get())
    user.set({
      name: 'b',
    })
    items.get().push(1)
    items.set([...items.get(), 2])
    const _t = [b.get(), a.get()]
    a.set(_t[0])
    b.set(_t[1])
    handlerOnly++
    for (let i = 0; i < 3; count.set(count.get() + 1)) i++
    const name2 = (name) => name
    console.log(old, now, name2('z'), handlerOnly)
  }
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling.nextSibling
  const _m2 = _m1.nextSibling.nextSibling
  const _m3 = _m2.nextSibling.nextSibling
  const _m4 = _m3.nextSibling.nextSibling
  const _m5 = _m4.nextSibling.nextSibling
  listen(_el, 'click', mutate)
  text(_m0, () => count.get())
  text(_m1, () => total.get())
  text(_m2, () => label.get())
  insert(_el, () => user.get()?.name, _m3)
  insert(_el, () => a.get(), _m4)
  insert(_el, () => b.get(), _m5)
  return _el
}
