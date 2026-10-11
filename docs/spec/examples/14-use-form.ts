// Receita oficial de formulário (não é API do núcleo; vira @jotastic/form na fase 2).
// Só `let`, objetos reativos, derivados e `tick`. ~50 linhas.
import { tick } from 'jotastic'

type Values = Record<string, unknown>
type Validators<T> = { [K in keyof T]?: (value: T[K], values: T) => string | false | null | undefined }

export function useForm<T extends Values>(initial: T, validators: Validators<T> = {}) {
  let values = { ...initial } as T                                   // cópia mutável (não acompanha `initial`)
  let touched = {} as Partial<Record<keyof T, boolean>>
  let submitting = false
  let serverError: string | null = null

  // derivados: recalculam quando `values` muda
  const errors = Object.fromEntries(
    (Object.keys(validators) as (keyof T)[]).map(k => [k, validators[k]!(values[k], values) || null]),
  ) as Record<keyof T, string | null>
  const valid = Object.values(errors).every(e => e === null)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)

  const error = (name: keyof T) => (touched[name] ? errors[name] : null)

  // props para espalhar em <input>/<select>/<textarea>: value two-way + touched + aria
  function field<K extends keyof T>(name: K) {
    return {
      name,
      get value() { return values[name] },
      set value(v: T[K]) { values[name] = v },                          // o runtime usa o setter no two-way via spread
      onBlur: () => (touched[name] = true),
      get 'aria-invalid'() { return !!error(name) },
    }
  }
  function checkbox<K extends keyof T>(name: K) {
    return {
      type: 'checkbox' as const,
      get checked() { return !!values[name] },
      set checked(v: boolean) { (values as Values)[name as string] = v },
      onBlur: () => (touched[name] = true),
    }
  }
  function radio<K extends keyof T>(name: K, option: T[K]) {
    return {
      type: 'radio' as const,
      name,
      value: String(option),
      get checked() { return values[name] === option },
      onChange: () => { values[name] = option; touched[name] = true },
    }
  }

  function submit(fn: (values: T) => void | Promise<void>) {
    return async (e: SubmitEvent) => {
      e.preventDefault()
      for (const k of Object.keys(validators)) touched[k as keyof T] = true
      if (!valid) {
        await tick()                                                   // deixa o DOM mostrar os erros
        e.currentTarget && (e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
        return
      }
      submitting = true
      serverError = null
      try { await fn(values) }
      catch (err) { serverError = (err as Error).message }
      finally { submitting = false }
    }
  }

  function reset() {
    values = { ...initial } as T
    touched = {}
    serverError = null
  }

  return { values, errors, touched, valid, dirty, submitting, serverError, error, field, checkbox, radio, submit, reset }
}
