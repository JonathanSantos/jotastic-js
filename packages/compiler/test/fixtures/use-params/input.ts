// 18 §11 (D59): todo parâmetro posicional é getter; defaults em thunk no callee (`p = _void`, `p = () => d`);
// desestruturado `_arg0().a`; rest = array de getters
import { watch, on } from 'jotastic'

export function useParams(url: string, ms = 100, { a, b: [c] = [1] }: { a: number; b?: number[] }, ...rest: number[]) {
  watch(() => console.log(url, ms, a, c, rest.length))
  return { total: url.length + ms }
}

export function useHandler(el: HTMLElement | undefined, handler: (e: Event) => void) {
  on(document, 'click', (e) => {
    if (el && !el.contains(e.target as Node)) handler(e)
  })
}

export const useArrow = (n: number) => ({ double: n * 2, n })

export function useDefaults(a: number, b = a + 1, init: { n?: number } = {}) {
  return { sum: a + b + (init.n ?? 0) }
}
