// `jotastic/store`: store global reativo à la Zustand, sem seletores (o proxy rastreia por propriedade).
//
// - `createStore(state, members)` (D62): `state` (objeto ou função) vira um objeto reativo (`reactive`); `members` roda
//   uma vez (sem rastrear): getters → memos (criados no 1º acesso, sem owner, para viverem tanto quanto o store);
//   funções → ações.
// - O store e `get()` são a mesma visão: dentro de uma ação o estado é mutável; fora, readonly (em dev avisa
//   `store-mutated-outside-action`; em prod a escrita passa).
// - Ação = `batch` + flag `inAction`. Sem flush síncrono (D61): o DOM atualiza no microtask, como no resto da lib.
//   Ação async: só o trecho síncrono até o 1º `await` fica dentro; depois, `set` funciona sem contexto de ação.

import { devtoolsHook, emitDevtools } from './runtime/devtools'
import { DEV } from './runtime/env'
import { runWithOwner } from './runtime/owner'
import { reactive, readonly } from './runtime/proxy'
import { batch, memo, untrack, type Memo } from './runtime/reactive'
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
 * Cria o store (D62). `state` (objeto ou função que o devolve) é o estado reativo; `members(set, get)` roda uma vez
 * e devolve getters (memos) e ações. Ver `docs/spec/08-store.md`.
 * `set`: objeto → merge raso; função com retorno objeto → merge do retorno; função sem retorno → mutações no draft.
 */
export function createStore<S extends object, M extends object = {}>(
  initial: S | (() => S),
  members?: (set: SetFn<S>, get: () => S) => M,
  options?: StoreOptions,
): Store<S, M> {
  const name = options?.name ?? 'store'
  const state = reactive<Dict>({})
  const ro = readonly(state, 'store-mutated-outside-action', { name })
  const getters = new Map<PropertyKey, () => unknown>()
  const memos = new Map<PropertyKey, Memo<unknown>>()
  const actions = new Map<PropertyKey, AnyFn>()
  /** Membros que não são getter nem função: expostos como estão (não são estado). */
  const consts = new Map<PropertyKey, unknown>()
  /** Objeto inicial copiado: as mutações do estado não o alcançam, então `$reset` volta a ele. */
  const seed = typeof initial === 'function' ? undefined : (clone(initial) as Dict)
  const fresh = (): Dict => (seed ? (clone(seed) as Dict) : (clone(untrack(initial as () => S)) as Dict))

  /** Roda `fn` como ação: flag + batch. Sem flush síncrono (D61): o DOM atualiza no microtask. */
  const inAction = <T>(fn: () => T): T =>
    batch(() => {
      actionDepth++
      try {
        return fn()
      } finally {
        actionDepth--
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

  const isMember = (key: PropertyKey): boolean => getters.has(key) || actions.has(key) || consts.has(key)

  const view: Dict = new Proxy<Dict>(Object.create(null), {
    get(_t, key) {
      if (getters.has(key)) return readMemo(key)
      const a = actions.get(key)
      if (a) return a
      if (consts.has(key)) return consts.get(key)
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
      return isMember(key) || key in state
    },
    ownKeys() {
      return [...Reflect.ownKeys(state), ...getters.keys(), ...actions.keys(), ...consts.keys()] as (string | symbol)[]
    },
    getOwnPropertyDescriptor(_t, key): PropertyDescriptor | undefined {
      if (isMember(key) || Object.hasOwn(state, key))
        return { configurable: true, enumerable: true, writable: !isMember(key), value: view[key] }
      return undefined
    },
  })

  const get = (): S => view as unknown as S

  const merge = (partial: unknown): void => {
    if (typeof partial !== 'object' || partial === null) return
    for (const k of Object.keys(partial)) {
      if (isMember(k)) continue
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

  /** Substitui o estado pelo objeto dado (chaves ausentes são removidas). */
  const load = (next: Dict): void => {
    for (const k of Object.keys(state)) if (!Object.hasOwn(next, k)) delete state[k]
    for (const k of Object.keys(next)) state[k] = next[k]
  }

  const wrapAction = (key: string, fn: AnyFn): AnyFn =>
    function (this: unknown, ...args: unknown[]) {
      const before = DEV && devtoolsHook() ? clone(state) : undefined
      const r = inAction(() => fn.apply(this, args))
      if (before) emitAction(key, args, before)
      return r
    }

  const api = {
    $snapshot: (): S => clone(state) as S,
    $reset: (): void => {
      const before = DEV && devtoolsHook() ? clone(state) : undefined
      inAction(() => load(fresh()))
      if (before) emitAction('$reset', [], before)
    },
    $name: name,
  }

  inAction(() => load(fresh()))
  if (members) {
    const def = untrack(() => members(set, get))
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(def))) {
      if (d.get) getters.set(k, d.get)
      else if (typeof d.value === 'function') actions.set(k, wrapAction(k, d.value))
      else consts.set(k, d.value)
    }
  }
  if (DEV) hmrState.set(view, state)
  return view as unknown as Store<S, M>
}

// ─── HMR (dev) ───────────────────────────────────────────────────────────────

/** Store (view) → estado reativo; só em dev, para o hot swap copiar o estado do store antigo para o novo. */
const hmrState = new WeakMap<object, Dict>()

/**
 * Interno (dev, HMR): chamado pelo rodapé que `@jotastic/vite` anexa a módulos com `export const x = createStore(…)`.
 * `data` = `import.meta.hot.data` (sobrevive à reexecução do módulo). Na reexecução, copia para cada store novo as
 * chaves de estado (não getters/ações) que ainda existem nele, do store antigo de mesmo nome; depois guarda os novos.
 * `reset` (`// @refresh reset`): não copia. O módulo não se auto-aceita: a atualização sobe até os componentes que o
 * importam, que reexecutam com o store novo (senão importadores ficariam com o antigo).
 */
export function __hmrStores(data: Record<string, unknown>, stores: Record<string, unknown>, reset = false): void {
  if (!DEV || !data) return
  const prev = data.jotasticStores as Record<string, unknown> | undefined
  if (prev && !reset) {
    const kept: string[] = []
    for (const [name, store] of Object.entries(stores)) {
      const from: Dict | undefined = prev[name] ? hmrState.get(prev[name] as object) : undefined
      const to: Dict | undefined = store ? hmrState.get(store as object) : undefined
      if (!from || !to || from === to) continue
      batch(() => {
        for (const k of Object.keys(from)) if (Object.hasOwn(to, k)) to[k] = clone(from[k])
      })
      kept.push(name)
    }
    if (kept.length) console.info(`[jotastic] HMR stores preservados: ${kept.join(', ')}`)
  }
  data.jotasticStores = stores
}
