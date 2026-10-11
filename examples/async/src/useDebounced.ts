// [ajuste] `useDebounced` de docs/spec/examples/07-use-functions.ts (06-async só o declarava).
import { watch } from 'jotastic'

export function useDebounced<T>(value: T, ms: number) {
  let debounced = value // cópia inicial
  watch(() => {
    const v = value // lê `value` (dependência)
    const id = setTimeout(() => (debounced = v), ms)
    return () => clearTimeout(id)
  })
  return { value: debounced }
}
