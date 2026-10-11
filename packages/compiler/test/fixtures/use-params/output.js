import { effect, memo, on } from 'jotastic/runtime'
// 18 §11: todo parâmetro posicional é getter; default `p() ?? d`; desestruturado `_arg0().a`; rest = array de getters

export function useParams(url, ms, _arg0, ...rest) {
  effect(() => console.log(url(), ms() ?? 100, _arg0().a, (_arg0().b ?? [1])[0], rest.map((_g) => _g()).length), {
    name: 'watch',
    loc: 'input.ts:5:3',
  })
  const _total = memo(() => url().length + (ms() ?? 100), {
    name: 'total',
    loc: 'input.ts:6:19',
  })
  return {
    get total() {
      return _total.get()
    },
  }
}
export function useHandler(el, handler) {
  on(
    () => document,
    'click',
    (e) => {
      if (el() && !el().contains(e.target)) handler()(e)
    },
  )
}
export const useArrow = (n) => {
  const _double = memo(() => n() * 2, {
    name: 'double',
    loc: 'input.ts:15:51',
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
