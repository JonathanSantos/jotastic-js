// Integração com o mundo externo: external, on, onMount, inspect (04-efeitos-e-ciclo-de-vida.md).

import { DEV } from './env'
import { wrapHandler } from './dom'
import {
  createOwner,
  dispose,
  getOwner,
  jotasticError,
  onCleanup,
  runWithOwner,
  type DevMeta,
  type Owner,
} from './owner'
import { effect, signal, untrack, type Signal } from './reactive'

// ─── external ────────────────────────────────────────────────────────────────

/** Métodos genéricos de destruição, na ordem de preferência (depois de `[Symbol.dispose]`). */
const GENERIC = ['destroy', 'dispose', 'disconnect', 'unsubscribe'] as const

/** `close`/`abort`/`terminate` só para tipos conhecidos: nunca chamar um `close()` que "fecha um painel". */
const KNOWN: ReadonlyArray<readonly [string, string]> = [
  ['WebSocket', 'close'],
  ['EventSource', 'close'],
  ['AbortController', 'abort'],
  ['Worker', 'terminate'],
  ['MessagePort', 'close'],
  ['IDBDatabase', 'close'],
]

/**
 * Destruição automática. Valor função → chamada como destroy (X-5: `subscribe` devolve `unsubscribe`). Senão o primeiro
 * método que existir. Interno (exportado para testes).
 */
export function autoDestroy(value: unknown): void {
  if (typeof value === 'function') {
    ;(value as () => void)()
    return
  }
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return
  const v = value as Record<PropertyKey, unknown>
  const sym = (Symbol as { dispose?: symbol }).dispose
  if (sym !== undefined && typeof v[sym] === 'function') {
    ;(v[sym] as () => void)()
    return
  }
  for (const m of GENERIC) {
    if (typeof v[m] === 'function') {
      ;(v[m] as () => void)()
      return
    }
  }
  const g = globalThis as Record<string, unknown>
  for (const [ctor, m] of KNOWN) {
    const C = g[ctor]
    if (typeof C === 'function' && value instanceof (C as new () => unknown) && typeof v[m] === 'function') {
      ;(v[m] as () => void)()
      return
    }
  }
}

/**
 * Objeto com ciclo de vida. `create` roda num efeito de usuário (depois do DOM), dentro de um owner `external`
 * próprio (descartado antes de `destroy`).
 * - Com `update`: `create` untracked uma vez; `update(value)` roda rastreado (na mesma execução e a cada mudança).
 * - Sem `update`: `create` rastreado; ao mudar, destrói e cria de novo.
 */
export function external<T>(
  create: () => T,
  update?: (value: T) => void,
  destroy?: (value: T) => void,
  dev?: DevMeta,
): Signal<T> {
  const owner = getOwner()
  const value = signal<T | undefined>(undefined, dev)
  let mounted = false
  let scope: Owner | null = null
  let current: T | undefined

  const build = (): T => {
    const s = createOwner('external', owner)
    let v: T
    try {
      v = runWithOwner(s, create)
    } catch (e) {
      dispose(s)
      throw e
    }
    scope = s
    current = v
    mounted = true
    value.set(v)
    return v
  }

  const teardown = (): void => {
    const s = scope
    if (!s) return
    const v = current as T
    scope = null
    current = undefined
    dispose(s)
    if (destroy) destroy(v)
    else autoDestroy(v)
  }

  if (update) {
    if (owner) onCleanup(teardown)
    effect(() => {
      const v = scope ? (current as T) : untrack(build)
      update(v)
    }, dev)
  } else {
    effect(() => {
      build()
      return teardown
    }, dev)
  }

  return {
    get() {
      const v = value.get()
      if (!mounted && DEV) {
        throw jotasticError(
          'ref-before-mount',
          `external${dev?.name ? ` "${dev.name}"` : ''} lido antes de montar; leia em onMount, handler, watch ou update${dev?.loc ? ` (${dev.loc})` : ''}`,
        )
      }
      return v as T
    },
    set(next: T) {
      value.set(next)
    },
    peek() {
      return value.peek() as T
    },
  }
}

// ─── on ──────────────────────────────────────────────────────────────────────

function isEventTarget(t: unknown): t is EventTarget {
  return (
    t !== null &&
    typeof t === 'object' &&
    typeof (t as EventTarget).addEventListener === 'function' &&
    typeof (t as EventTarget).removeEventListener === 'function'
  )
}

/** Listener com alvo lazy (D53): liga quando `target()` é um EventTarget, re-liga quando muda, remove no dispose. */
export function on(
  target: () => EventTarget | null | undefined,
  type: string,
  handler: (e: Event) => unknown,
  opts?: AddEventListenerOptions,
): void {
  const owner = getOwner()
  const listener = wrapHandler(owner, handler)
  effect(() => {
    const t = target()
    if (!isEventTarget(t)) return
    t.addEventListener(type, listener, opts)
    return () => t.removeEventListener(type, listener, opts)
  })
}

// ─── onMount / inspect ───────────────────────────────────────────────────────

/** Efeito de usuário que roda `fn` sem rastrear, uma vez, depois do DOM. */
export function onMount(fn: () => void): void {
  effect(() => {
    untrack(fn)
  })
}

/** Dev: loga os valores lidos (com nome/loc) a cada mudança. Em prod o compilador remove a chamada. */
export function inspect(dev: DevMeta, ...reads: Array<() => unknown>): void {
  if (!DEV) return
  const label = `[jotastic] inspect${dev.name ? ` ${dev.name}` : ''}${dev.loc ? ` (${dev.loc})` : ''}`
  effect(
    () => {
      const values = reads.map((r) => r())
      console.log(label, ...values)
    },
    { name: dev.name ? `inspect ${dev.name}` : 'inspect', loc: dev.loc },
  )
}
