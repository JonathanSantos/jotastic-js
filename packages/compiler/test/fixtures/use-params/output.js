import { _void, effect, memo, on } from 'jotastic/runtime'
// 18 §11 (D59): todo parâmetro posicional é getter; defaults em thunk no callee (`p = _void`, `p = () => d`);
// desestruturado `_arg0().a`; rest = array de getters

export function useParams(url = _void, ms = () => 100, _arg0 = _void, ...rest) {
  effect(() => console.log(url(), ms(), _arg0().a, (_arg0().b ?? [1])[0], rest.map((_g) => _g()).length), {
    name: 'watch',
    loc: 'input.ts:6:3',
  })
  const _total = memo(() => url().length + ms(), {
    name: 'total',
    loc: 'input.ts:7:19',
  })
  return {
    get total() {
      return _total.get()
    },
  }
}
export function useHandler(el = _void, handler = _void) {
  on(
    () => document,
    'click',
    (e) => {
      if (el() && !el().contains(e.target)) handler()(e)
    },
  )
}
export const useArrow = (n = _void) => {
  const _double = memo(() => n() * 2, {
    name: 'double',
    loc: 'input.ts:16:51',
  })
  return {
    get double() {
      return _double.get()
    },
    get n() {
      return n()
    },
  }
}
export function useDefaults(a = _void, b = () => a() + 1, init = () => ({})) {
  const _sum = memo(() => a() + b() + (init().n ?? 0), {
    name: 'sum',
    loc: 'input.ts:19:17',
  })
  return {
    get sum() {
      return _sum.get()
    },
  }
}
