// `jotastic/store`: store global reativo à la Zustand, sem seletores (o proxy rastreia por propriedade).
//
// - A factory roda uma vez (sem rastrear). Propriedades: funções → ações; getters → memos (criados no 1º acesso,
//   sem owner, para viverem tanto quanto o store); resto → estado num objeto reativo (`reactive`).
// - O store e `get()` são a mesma visão: dentro de uma ação o estado é mutável; fora, readonly (em dev avisa
//   `store-mutated-outside-action`; em prod a escrita passa).
// - Ação = `batch` + flag `inAction` + `flush()` ao sair do batch mais externo (uma rodada de atualização).
//   Ação async: só o trecho síncrono até o 1º `await` fica dentro; depois, cada `set` é seu próprio batch/flush.

import { devtoolsHook, emitDevtools } from './runtime/devtools'
import { DEV } from './runtime/env'
import { runWithOwner } from './runtime/owner'
import { reactive, readonly } from './runtime/proxy'
import { batch, flush, memo, untrack, type Memo } from './runtime/reactive'
import type { SetFn, Store } from './public-types'

export type { DeepReadonly, SetFn, Store } from './public-types'

type AnyFn = (...args: any[]) => any
type Dict = Record<PropertyKey, unknown>

export interface StoreOptions {
  /** Nome para o devtools (o compilador infere do export). */
  name?: string
}

/** Profundidade de ações em execução (global: uma ação de um store pode chamar a de outro). */
let actionDepth = 0

function isPlainObject(v: unknown): v is Dict {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Cópia profunda de POJO/array (lê pelo proxy ou pelo raw, tanto faz); outros valores por referência. */
function clone(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clone)
  if (isPlainObject(v)) {
    const o: Dict = {}
    for (const k of Object.keys(v)) o[k] = clone(v[k])
    return o
  }
  return v
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((x, i) => deepEqual(x, b[i]))
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
}

/**
 * Cria o store. `factory` roda uma vez; ver `docs/spec/08-store.md`.
 * `set`: objeto → merge raso; função com retorno objeto → merge do retorno; função sem retorno → mutações no draft.
 */
export function createStore<S extends object>(
  factory: (set: SetFn<S>, get: () => S) => S,
  options?: StoreOptions,
): Store<S> {
  const name = options?.name ?? 'store'
  const state = reactive<Dict>({})
  const ro = readonly(state, 'store-mutated-outside-action', { name })
  const getters = new Map<PropertyKey, () => unknown>()
  const memos = new Map<PropertyKey, Memo<unknown>>()
  const actions = new Map<PropertyKey, AnyFn>()

  /** Roda `fn` como ação: flag + batch + flush ao fim do batch mais externo. */
  const inAction = <T>(fn: () => T): T =>
    batch(() => {
      actionDepth++
      try {
        return fn()
      } finally {
        actionDepth--
        flush()
      }
    })

  /** Estado (dev): readonly fora de ação. */
  const base = (): Dict => (actionDepth > 0 ? state : ro)

  const readMemo = (key: PropertyKey): unknown => {
    let m = memos.get(key)
    if (!m) {
      const g = getters.get(key)!
      // Sem owner: o memo é do store, não do componente que o leu primeiro.
      m = runWithOwner(null, () => memo(() => g.call(view), DEV ? { name: `${name}.${String(key)}` } : undefined))
      memos.set(key, m)
    }
    return m.get()
  }

  const view: Dict = new Proxy<Dict>(Object.create(null), {
    get(_t, key) {
      if (getters.has(key)) return readMemo(key)
      const a = actions.get(key)
      if (a) return a
      if (key in api) return api[key as keyof typeof api]
      return base()[key]
    },
    set(_t, key, value) {
      return Reflect.set(base(), key, value)
    },
    deleteProperty(_t, key) {
      return Reflect.deleteProperty(base(), key)
    },
    has(_t, key) {
      return getters.has(key) || actions.has(key) || key in state
    },
    ownKeys() {
      return [...Reflect.ownKeys(state), ...getters.keys(), ...actions.keys()] as (string | symbol)[]
    },
    getOwnPropertyDescriptor(_t, key): PropertyDescriptor | undefined {
      if (getters.has(key) || actions.has(key) || Object.hasOwn(state, key))
        return { configurable: true, enumerable: true, writable: !actions.has(key), value: view[key] }
      return undefined
    },
  })

  const get = (): S => view as unknown as S

  const merge = (partial: unknown): void => {
    if (typeof partial !== 'object' || partial === null) return
    for (const k of Object.keys(partial)) {
      if (getters.has(k) || actions.has(k)) continue
      state[k] = (partial as Dict)[k]
    }
  }

  const set: SetFn<S> = (update) => {
    const outside = actionDepth === 0
    const before = outside && DEV && devtoolsHook() ? clone(state) : undefined
    inAction(() => merge(typeof update === 'function' ? update(view as unknown as S) : update))
    // `set` fora de ação (depois de um `await`): registra no devtools como sua própria entrada.
    if (before) emitAction('set', [update], before)
  }

  const emitAction = (action: string, args: unknown[], before: unknown): void => {
    const now = clone(state) as Dict
    const prev = before as Dict
    const keys = new Set([...Object.keys(prev), ...Object.keys(now)])
    const changed = [...keys].filter((k) => !deepEqual(prev[k], now[k]))
    emitDevtools({ type: 'store:action', store: name, action, args, changed })
  }

  /** Copia o estado inicial de uma definição para o objeto reativo. */
  const load = (def: object, init: boolean): void => {
    const keys = new Set<PropertyKey>()
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(def))) {
      if (d.get) {
        if (init) getters.set(k, d.get)
      } else if (typeof d.value === 'function') {
        if (init) actions.set(k, wrapAction(k, d.value))
      } else {
        keys.add(k)
        state[k] = d.value
      }
    }
    if (!init) for (const k of Object.keys(state)) if (!keys.has(k)) delete state[k]
  }

  const wrapAction = (key: string, fn: AnyFn): AnyFn =>
    function (this: unknown, ...args: unknown[]) {
      const before = DEV && devtoolsHook() ? clone(state) : undefined
      const r = inAction(() => fn.apply(this, args))
      if (before) emitAction(key, args, before)
      return r
    }

  const api = {
    $snapshot: (): S => {
      const o = clone(state) as Dict
      for (const k of getters.keys()) o[k as string] = clone(untrack(() => readMemo(k)))
      return o as S
    },
    $reset: (): void => {
      const before = DEV && devtoolsHook() ? clone(state) : undefined
      inAction(() =>
        load(
          untrack(() => factory(set, get)),
          false,
        ),
      )
      if (before) emitAction('$reset', [], before)
    },
    $name: name,
  }

  inAction(() =>
    load(
      untrack(() => factory(set, get)),
      true,
    ),
  )
  return view as unknown as Store<S>
}
