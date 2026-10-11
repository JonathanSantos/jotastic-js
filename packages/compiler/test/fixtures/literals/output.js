import { template, signal, reactive, memo, insert } from 'jotastic/runtime'
const _t0 = template('<p data-jo="input.tsx:16"><!> <!> <!> <!> <!> <!></p>')
export function Literals() {
  const n = signal(1, {
    name: 'n',
    loc: 'input.tsx:2:7',
  })
  const todos = reactive([
    {
      id: 1,
      done: false,
    },
  ])
  const cart = reactive({
    items: [],
    get count() {
      return _count.get()
    },
    get total() {
      return _total.get()
    },
  })
  const _count = memo(
    () => {
      return cart.items.length
    },
    {
      name: 'cart.count',
      loc: 'input.tsx:6:5',
    },
  )
  const _total = memo(
    () => {
      return cart.items.reduce((a, b) => a + b, 0) * n.get()
    },
    {
      name: 'cart.total',
      loc: 'input.tsx:9:5',
    },
  )
  const derived = memo(
    () => ({
      double: n.get() * 2,
    }),
    {
      name: 'derived',
      loc: 'input.tsx:13:9',
    },
  )
  const _first = memo(() => derived.get(), {
    name: 'first, second',
    loc: 'input.tsx:14:9',
  })
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling.nextSibling
  const _m2 = _m1.nextSibling.nextSibling
  const _m3 = _m2.nextSibling.nextSibling
  const _m4 = _m3.nextSibling.nextSibling
  const _m5 = _m4.nextSibling.nextSibling
  insert(_el, () => todos.length, _m0)
  insert(_el, () => cart.count, _m1)
  insert(_el, () => cart.total, _m2)
  insert(_el, () => derived.get().double, _m3)
  insert(_el, () => _first.get().first, _m4)
  insert(_el, () => _first.get().second ?? 2, _m5)
  return _el
}
