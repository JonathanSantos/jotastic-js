// Funções `use*`: lógica reutilizável com as mesmas regras do componente.
// Parâmetros são lazy (leem o valor atual), o retorno vira getters/setters, sem regras de hooks.
import { watch, on, onCleanup } from 'jotastic'
import { fetch } from 'jotastic/fetch'                     // anexa o abortSignal() ambiente: aborta no cleanup do watch

export function useFetch<T>(url: string, init?: RequestInit) {
  let data: T | null = null
  let error: Error | null = null

  watch(() => {                                             // `url` lido vivo: refaz quando muda, aborta a anterior
    data = null; error = null
    fetch(url, init)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))))
      .then(d => (data = d))
      .catch(e => e.name !== 'AbortError' && (error = e))
  })

  return { data, error, loading: data === null && error === null }
}

export function useDebounced<T>(value: T, ms: number) {
  let debounced = value                                     // cópia inicial
  watch(() => {
    const v = value                                         // lê `value` (dependência)
    const id = setTimeout(() => (debounced = v), ms)
    return () => clearTimeout(id)
  })
  return { value: debounced }
}

export function useLocalStorage<T>(key: string, initial: T) {
  let value: T = JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial
  watch(() => localStorage.setItem(key, JSON.stringify(value)))
  on(window, 'storage', e => {
    if (e.key === key && e.newValue) value = JSON.parse(e.newValue)   // sincroniza entre abas
  })
  return { value }                                          // `store.value = x` escreve (setter gerado)
}

export function useMediaQuery(query: string) {
  const mql = window.matchMedia(query)                      // derivado: recria se `query` mudar
  let matches = mql.matches
  watch(() => (matches = mql.matches))                      // sincroniza quando `mql` é recriado
  on(mql, 'change', e => (matches = e.matches))             // alvo lazy: re-liga quando `mql` muda
  return { matches }
}

export function useInterval(fn: () => void, ms: number | null) {
  watch(() => {
    if (ms === null) return
    const id = setInterval(() => fn(), ms)                  // `fn()` lê o handler atual
    return () => clearInterval(id)
  })
}

export function useMouse() {
  const pos = { x: 0, y: 0 }                                // objeto reativo
  on(window, 'mousemove', e => { pos.x = e.clientX; pos.y = e.clientY })
  return pos
}

export function useClickOutside(el: HTMLElement | undefined, handler: () => void) {   // parâmetro lazy: lê o ref atual
  on(document, 'pointerdown', e => {
    if (el && !el.contains(e.target as Node)) handler()
  })
}

export function useTitle(title: string) {
  const previous = document.title
  watch(() => { document.title = title })
  onCleanup(() => { document.title = previous })
}

/* Em um componente:

   const users = useFetch<User[]>(`/api/users?q=${query}`)   // compila para useFetch(() => `…${query}`)
   const isMobile = useMediaQuery('(max-width: 600px)')
   const settings = useLocalStorage('settings', { theme: 'light' })
   useClickOutside(menu, () => (open = false))               // `menu` é um ref; nada de () => menu
   useTitle(`${users.data?.length ?? 0} usuários`)
   if (isMobile.matches) return <MobileList items={users.data} />
*/
