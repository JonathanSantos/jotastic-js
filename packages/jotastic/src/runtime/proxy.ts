// STUB do passo 1. O passo 2 (objetos reativos) substitui este arquivo por `reactive`, `raw`, `isReactive`,
// `toReactive` e `readonly` de verdade. `shallowEqual` já é a implementação final (o memo depende dela).

import type { DevMeta } from './owner'

/** Stub: identidade. No passo 2, POJO/array → proxy reativo. */
export function toReactive<T>(v: T): T {
  return v
}

/** Stub: identidade. No passo 2, proxy que avisa ao escrever (dev). */
export function readonly<T>(v: T, _diagnostic: 'derived-mutated' | 'store-mutated-outside-action', _dev?: DevMeta): T {
  return v
}

function isPlain(v: unknown): v is Record<PropertyKey, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Comparação rasa: mesmo length e `Object.is` por índice / mesmas chaves e `Object.is` por valor. */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
    return true
  }
  if (!isPlain(a) || !isPlain(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (!Object.hasOwn(b, k) || !Object.is(a[k], b[k])) return false
  return true
}
