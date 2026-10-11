// Entrada: examples/07-use-functions.ts (useFetch, useMediaQuery, useClickOutside)
import { state, signal, memo, effect, on } from 'jotastic/runtime'
import { fetch } from 'jotastic/fetch'

// Parâmetros posicionais de use* chegam como getters. O corpo lê `url()`.
export function useFetch(url, init) {
  const data = state(null, { name: 'data', loc: 'useFetch.ts:5:7' })
  const error = signal(null, { name: 'error', loc: 'useFetch.ts:6:7' })

  effect(() => {
    data.set(null); error.set(null)
    fetch(url(), init())                                   // abortSignal() ambiente do effect: aborta no cleanup
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(d => data.set(d))
      .catch(e => e.name !== 'AbortError' && error.set(e))
  }, { name: 'watch', loc: 'useFetch.ts:8:3' })

  // `loading` é um literal com leituras reativas dentro do objeto de retorno → memo
  const _loading = memo(() => data.get() === null && error.get() === null, { name: 'loading', loc: 'useFetch.ts:15:30' })

  return {
    get data() { return data.get() },
    set data(v) { data.set(v) },
    get error() { return error.get() },
    set error(v) { error.set(v) },
    get loading() { return _loading.get() },
  }
}

export function useMediaQuery(query) {
  const mql = memo(() => window.matchMedia(query()), { name: 'mql', loc: 'useMediaQuery.ts:2:9' })
  const matches = signal(mql.get().matches, { name: 'matches', loc: 'useMediaQuery.ts:3:7' })
  on(() => mql.get(), 'change', e => matches.set(e.matches))
  return { get matches() { return matches.get() }, set matches(v) { matches.set(v) } }
}

export function useClickOutside(el, handler) {
  on(() => document, 'pointerdown', e => {
    if (el() && !el().contains(e.target)) handler()()     // `handler` também chega como getter; chamar = handler()(…)
  })
}

// Chamada em um componente:
//   const users = useFetch(`/api/users?q=${query}`)
// compila para
//   const users = useFetch(() => `/api/users?q=${query.get()}`, () => undefined)
// e `users.loading` no JSX fica `users.loading` (getter já reativo; nenhuma reescrita).
