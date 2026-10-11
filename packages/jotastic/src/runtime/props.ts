// Props (rest / mergeProps) e contexto (createContext / provide / useContext).

import { DEV } from './env'
import { getOwner, jotasticError } from './owner'

type Bag = Record<PropertyKey, unknown>

/** Descritor de acessor que encaminha a leitura (e a escrita, só se a origem tem setter) para `src[key]`. */
function forward(src: () => Bag, key: PropertyKey, d: PropertyDescriptor): PropertyDescriptor {
  return {
    configurable: true,
    enumerable: d.enumerable ?? true,
    get: () => src()[key],
    set: d.set
      ? (v: unknown) => {
          src()[key] = v
        }
      : undefined,
  }
}

/**
 * `...rest` em props: objeto vivo cujas leituras encaminham para `props` (preservando getters), sem as `keys`.
 * `ownKeys` reflete as chaves atuais de `props`.
 */
export function rest<P extends object, K extends keyof P>(props: P, keys: readonly K[]): Omit<P, K> {
  const excluded = new Set<PropertyKey>(keys as readonly PropertyKey[])
  const src = () => props as Bag
  return new Proxy({} as Bag, {
    get(_, k) {
      return excluded.has(k) ? undefined : (props as Bag)[k]
    },
    set(_, k, v) {
      if (excluded.has(k)) return false
      ;(props as Bag)[k] = v
      return true
    },
    has(_, k) {
      return !excluded.has(k) && k in props
    },
    ownKeys() {
      return Reflect.ownKeys(props).filter((k) => !excluded.has(k))
    },
    getOwnPropertyDescriptor(_, k) {
      if (excluded.has(k)) return undefined
      const d = Reflect.getOwnPropertyDescriptor(props, k)
      return d ? forward(src, k, d) : undefined
    },
  }) as unknown as Omit<P, K>
}

/**
 * `<Comp {...a} x={1} {...b} />` → `mergeProps(a, { x: 1 }, b)`. Leitura por chave: a última fonte que tem a chave
 * vence; getters são preservados (lidos no acesso). Fontes função são reavaliadas a cada leitura.
 */
export function mergeProps(...sources: Array<object | (() => object)>): Record<string, unknown> {
  const resolve = (i: number): Bag => {
    const s = sources[i]
    return (typeof s === 'function' ? (s as () => object)() : s) as Bag
  }
  /** Índice da última fonte que tem `k`, ou -1. */
  const find = (k: PropertyKey): number => {
    for (let i = sources.length - 1; i >= 0; i--) {
      const s = resolve(i)
      if (s != null && k in s) return i
    }
    return -1
  }
  return new Proxy({} as Bag, {
    get(_, k) {
      const i = find(k)
      return i < 0 ? undefined : resolve(i)[k]
    },
    set(_, k, v) {
      const i = find(k)
      if (i < 0) return false
      resolve(i)[k] = v
      return true
    },
    has(_, k) {
      return find(k) >= 0
    },
    ownKeys() {
      const keys = new Set<PropertyKey>()
      for (let i = 0; i < sources.length; i++) {
        const s = resolve(i)
        if (s != null) for (const k of Reflect.ownKeys(s)) keys.add(k)
      }
      return [...keys] as (string | symbol)[]
    },
    getOwnPropertyDescriptor(_, k) {
      for (let i = sources.length - 1; i >= 0; i--) {
        const s = resolve(i)
        if (s == null) continue
        const d = Reflect.getOwnPropertyDescriptor(s, k)
        if (d) return forward(() => resolve(i), k, d)
      }
      return undefined
    },
  }) as Record<string, unknown>
}

// ─── Contexto ────────────────────────────────────────────────────────────────

export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T | undefined
}

export function createContext<T>(defaultValue?: T): Context<T> {
  return { id: Symbol(DEV ? 'context' : ''), defaultValue }
}

/** Registra `value` no owner atual. */
export function provide<T>(ctx: Context<T>, value: T): void {
  const owner = getOwner()
  if (!owner) {
    if (DEV) throw jotasticError('use-outside-owner', 'provide chamado fora de um owner')
    return
  }
  ;(owner.context ??= new Map()).set(ctx.id, value)
}

/** Sobe pela cadeia de owners; se não achar, `defaultValue`; se nem isso, erro em dev. */
export function useContext<T>(ctx: Context<T>): T {
  for (let o = getOwner(); o; o = o.parent) {
    if (o.context && o.context.has(ctx.id)) return o.context.get(ctx.id) as T
  }
  if (ctx.defaultValue === undefined && DEV) {
    throw jotasticError('context-missing', 'useContext sem Provider acima e sem valor padrão')
  }
  return ctx.defaultValue as T
}
