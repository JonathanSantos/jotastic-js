// Objetos reativos: proxy profundo e lazy para POJO e array (ver docs/spec/contracts/runtime.d.ts §Objetos reativos).
//
// - O alvo guarda sempre valores RAW; o proxy de um filho só é criado quando ele é lido.
// - Um signal-contador por propriedade, criado sob demanda (só quando há observador). Notificar = incrementar.
// - `$iter` (símbolo `ITER`) é o signal estrutural: chaves novas/removidas e, em arrays, qualquer troca de elemento.
// - Arrays: métodos de iteração assinam só `$iter` (uma assinatura por lista, não uma por índice); mutadores rodam
//   no raw dentro de `batch`/`untrack` e notificam `$iter`, `length` e os índices afetados que têm signal.
// - `readonly` (dev): proxy que avisa ao escrever e não muda o valor; leituras atravessam o alvo (e rastreiam).

import { warn } from './devtools'
import { DEV } from './env'
import type { DevMeta } from './owner'
import { batch, isTracking, signal, untrack, type Signal } from './reactive'

type AnyArray = unknown[]
type AnyFn = (...args: any[]) => any

const ITER: unique symbol = Symbol('$iter')

/** raw → proxy */
const proxies = new WeakMap<object, object>()
/** proxy → raw */
const targets = new WeakMap<object, object>()
/** Valores marcados com `raw()`: nunca proxiados. */
const marked = new WeakSet<object>()
/** raw → signals por chave (criados sob demanda). */
const deps = new WeakMap<object, Map<PropertyKey, Signal<number>>>()

const wellKnownSymbols = new Set<unknown>(
  Object.getOwnPropertyNames(Symbol)
    .map((k) => (Symbol as unknown as Record<string, unknown>)[k])
    .filter((v) => typeof v === 'symbol'),
)

function isPlainShape(v: object): boolean {
  const proto = Object.getPrototypeOf(v)
  return Array.isArray(v) ? proto === Array.prototype : proto === Object.prototype || proto === null
}

/** POJO/array raw ainda não marcado com `raw()` (e que não é um proxy nosso). */
function isProxiable(v: unknown): v is object {
  return (
    typeof v === 'object' && v !== null && !marked.has(v) && !targets.has(v) && !roTargets.has(v) && isPlainShape(v)
  )
}

function isIndex(key: PropertyKey): key is string {
  return typeof key === 'string' && key !== '' && String(Number(key) >>> 0) === key && key !== '4294967295'
}

// ─── Rastreamento ────────────────────────────────────────────────────────────

function track(t: object, key: PropertyKey): void {
  if (!isTracking()) return
  if (typeof key === 'symbol' && key !== ITER && wellKnownSymbols.has(key)) return
  let m = deps.get(t)
  if (!m) deps.set(t, (m = new Map()))
  let s = m.get(key)
  if (!s) m.set(key, (s = signal(0)))
  s.get()
}

function bump(s: Signal<number> | undefined): void {
  if (s) s.set(s.peek() + 1)
}

function notify(t: object, key: PropertyKey): void {
  const m = deps.get(t)
  if (m) bump(m.get(key))
}

/** Notifica os índices em [from, to) que têm signal. */
function notifyRange(m: Map<PropertyKey, Signal<number>>, from: number, to: number): void {
  if (from >= to) return
  for (const [k, s] of m) {
    if (isIndex(k)) {
      const i = Number(k)
      if (i >= from && i < to) bump(s)
    }
  }
}

// ─── Desembrulho ─────────────────────────────────────────────────────────────

/** Desembrulha readonly e proxy reativo, sem marcar nada. */
function toRaw<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v
  let x: object = v
  const ro = roTargets.get(x)
  if (ro) x = ro
  return (targets.get(x) ?? x) as T
}

/** Valor lido de `t[key]`, convertido em proxy se for POJO/array (respeitando o invariante de props congeladas). */
function wrapProp(t: object, key: PropertyKey, v: unknown): unknown {
  if (typeof v !== 'object' || v === null) return v
  const p = reactive(v)
  if (p !== v && !Object.isExtensible(t)) {
    const d = Object.getOwnPropertyDescriptor(t, key)
    if (d && !d.configurable && !d.writable) return v
  }
  return p
}

// ─── API pública ─────────────────────────────────────────────────────────────

/** POJO/array → proxy reativo (identidade estável). Qualquer outra coisa volta intacta. */
export function reactive<T extends object>(target: T): T {
  if (!isProxiable(target)) return target
  let p = proxies.get(target)
  if (!p) {
    p = new Proxy(target, Array.isArray(target) ? arrayHandler : objectHandler)
    proxies.set(target, p)
    targets.set(p, target)
  }
  return p as T
}

/** Proxy (reativo ou readonly) → alvo. POJO/array raw → marcado para nunca ser proxiado. Outros: identidade. */
export function raw<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v
  const ro = roTargets.get(v)
  if (ro) return raw(ro as T)
  const t = targets.get(v)
  if (t) return t as T
  if (isPlainShape(v)) marked.add(v)
  return v
}

export function isReactive(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const ro = roTargets.get(v)
  return targets.has(ro ?? v)
}

/** Equivalente a `reactive` para o `state()`: POJO/array → proxy, senão identidade. */
export function toReactive<T>(v: T): T {
  return typeof v === 'object' && v !== null ? reactive(v) : v
}

// ─── Handlers ────────────────────────────────────────────────────────────────

function hasOwn(o: object, k: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(o, k)
}

const objectHandler: ProxyHandler<object> = {
  get(t, key, receiver) {
    const v = Reflect.get(t, key, receiver)
    track(t, key)
    return wrapProp(t, key, v)
  },
  has(t, key) {
    track(t, ITER)
    return Reflect.has(t, key)
  },
  ownKeys(t) {
    track(t, ITER)
    return Reflect.ownKeys(t)
  },
  set(t, key, value, receiver) {
    // Escrita herdada (o proxy é protótipo de outro objeto): comportamento padrão.
    if (receiver !== proxies.get(t)) return Reflect.set(t, key, value, receiver)
    const d = Object.getOwnPropertyDescriptor(t, key)
    if (d && (d.get || d.set)) return Reflect.set(t, key, value, receiver)
    const next = toRaw(value)
    if (d && Object.is(d.value, next)) return true
    if (Array.isArray(t)) return setArray(t, key, next, d !== undefined)
    if (!Reflect.set(t, key, next)) return false
    notify(t, key)
    if (!d) notify(t, ITER)
    return true
  },
  deleteProperty(t, key) {
    const had = hasOwn(t, key)
    const ok = Reflect.deleteProperty(t, key)
    if (had && ok) {
      notify(t, key)
      notify(t, ITER)
    }
    return ok
  },
  defineProperty(t, key, desc) {
    const had = hasOwn(t, key)
    if ('value' in desc) desc = { ...desc, value: toRaw(desc.value) }
    const ok = Reflect.defineProperty(t, key, desc)
    if (ok) {
      notify(t, key)
      if (!had || Array.isArray(t)) notify(t, ITER)
    }
    return ok
  },
}

function setArray(t: AnyArray, key: PropertyKey, next: unknown, had: boolean): boolean {
  const oldLen = t.length
  if (!Reflect.set(t, key, next)) return false
  const m = deps.get(t)
  if (!m) return true
  const newLen = t.length
  if (key === 'length') {
    bump(m.get('length'))
    bump(m.get(ITER))
    notifyRange(m, newLen, oldLen)
  } else if (isIndex(key)) {
    bump(m.get(key))
    bump(m.get(ITER))
    if (newLen !== oldLen) bump(m.get('length'))
  } else {
    bump(m.get(key))
    if (!had) bump(m.get(ITER))
  }
  return true
}

const arrayHandler: ProxyHandler<object> = {
  ...objectHandler,
  get(t, key, receiver) {
    if (hasOwn(arrayMethods, key)) return arrayMethods[key as string]
    const v = Reflect.get(t, key, receiver)
    track(t, key)
    return wrapProp(t, key, v)
  },
}

// ─── Métodos de array ────────────────────────────────────────────────────────

const arrayMethods: Record<PropertyKey, AnyFn> = Object.create(null)
const proto = Array.prototype as unknown as Record<PropertyKey, AnyFn>

/** Alvo raw quando `self` é um proxy reativo de array; senão undefined (chamada genérica pelo nativo). */
function arrayTarget(self: unknown): AnyArray | undefined {
  return typeof self === 'object' && self !== null ? (targets.get(self) as AnyArray | undefined) : undefined
}

// Mutadores: rodam no raw (args desembrulhados) em batch, sem rastrear; notificam o que mudou.
for (const name of ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']) {
  const native = proto[name]!
  arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
    const t = arrayTarget(this)
    if (!t) return native.apply(this, args)
    const self = this
    return batch(() =>
      untrack(() => {
        let a = args.map(toRaw)
        if (name === 'sort' && typeof args[0] === 'function') {
          const cmp = args[0] as AnyFn
          a = [(x: unknown, y: unknown) => cmp(toReactive(x), toReactive(y))]
        }
        const m = deps.get(t)
        const oldLen = t.length
        // push/pop só mexem no fim; os demais podem mexer em qualquer índice (snapshot para comparar).
        const before = m && name !== 'push' && name !== 'pop' ? t.slice() : null
        const r = native.apply(t, a)
        if (m) {
          const newLen = t.length
          let changed = newLen !== oldLen
          if (before) {
            const n = Math.max(before.length, newLen)
            for (let i = 0; i < n; i++) {
              if (!Object.is(before[i], t[i])) {
                changed = true
                bump(m.get(String(i)))
              }
            }
          } else {
            notifyRange(m, Math.min(oldLen, newLen), Math.max(oldLen, newLen))
          }
          if (changed) {
            bump(m.get(ITER))
            if (newLen !== oldLen) bump(m.get('length'))
          }
        }
        if (name === 'pop' || name === 'shift') return toReactive(r)
        if (name === 'splice') return (r as AnyArray).map(toReactive)
        if (name === 'push' || name === 'unshift') return r
        return self
      }),
    )
  }
}

// Iteração com callback: assina `$iter`, roda no raw e entrega elementos como proxy.
type ResultKind = 'none' | 'el' | 'arr'
const callbackMethods: [string, ResultKind][] = [
  ['forEach', 'none'],
  ['map', 'none'],
  ['flatMap', 'none'],
  ['filter', 'arr'],
  ['find', 'el'],
  ['findLast', 'el'],
  ['findIndex', 'none'],
  ['findLastIndex', 'none'],
  ['some', 'none'],
  ['every', 'none'],
]
function convert(r: unknown, kind: ResultKind): unknown {
  return kind === 'el' ? toReactive(r) : kind === 'arr' ? (r as AnyArray).map(toReactive) : r
}
for (const [name, kind] of callbackMethods) {
  const native = proto[name]
  if (!native) continue
  arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
    const t = arrayTarget(this)
    if (!t) return native.apply(this, args)
    track(t, ITER)
    const self = this
    const cb = args[0] as AnyFn
    const thisArg = args[1]
    return convert(
      native.call(t, (v: unknown, i: number) => cb.call(thisArg, toReactive(v), i, self)),
      kind,
    )
  }
}

for (const name of ['reduce', 'reduceRight']) {
  const native = proto[name]!
  const right = name === 'reduceRight'
  arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
    const t = arrayTarget(this)
    if (!t) return native.apply(this, args)
    track(t, ITER)
    const cb = args[0] as AnyFn
    if (typeof cb !== 'function') return native.apply(t, args)
    const len = t.length
    let i = right ? len - 1 : 0
    const step = right ? -1 : 1
    let acc: unknown
    if (args.length > 1) acc = args[1]
    else {
      while (i >= 0 && i < len && !(i in t)) i += step
      if (i < 0 || i >= len) throw new TypeError('Reduce of empty array with no initial value')
      acc = toReactive(t[i])
      i += step
    }
    for (; i >= 0 && i < len; i += step) if (i in t) acc = cb(acc, toReactive(t[i]), i, this)
    return acc
  }
}

// Sem callback: assina `$iter`, roda no raw; resultados com elementos viram proxies.
const plainMethods: [string, ResultKind][] = [
  ['slice', 'arr'],
  ['concat', 'arr'],
  ['toReversed', 'arr'],
  ['toSpliced', 'arr'],
  ['with', 'arr'],
  ['at', 'el'],
  ['join', 'none'],
  ['toString', 'none'],
  ['toLocaleString', 'none'],
]
for (const [name, kind] of plainMethods) {
  const native = proto[name]
  if (!native) continue
  arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
    const t = arrayTarget(this)
    if (!t) return native.apply(this, args)
    track(t, ITER)
    return convert(native.apply(t, args), kind)
  }
}

if (proto.toSorted) {
  const native = proto.toSorted
  arrayMethods.toSorted = function (this: unknown, ...args: unknown[]) {
    const t = arrayTarget(this)
    if (!t) return native.apply(this, args)
    track(t, ITER)
    const cmp = args[0] as AnyFn | undefined
    const r = native.call(t, cmp && ((x: unknown, y: unknown) => cmp(toReactive(x), toReactive(y)))) as AnyArray
    return r.map(toReactive)
  }
}

// Busca: tenta com o argumento, com o raw dele e com o proxy do raw (o array pode guardar proxies).
for (const name of ['includes', 'indexOf', 'lastIndexOf']) {
  const native = proto[name]!
  const miss = name === 'includes' ? false : -1
  arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
    let self = this
    if (typeof self === 'object' && self !== null) self = roTargets.get(self) ?? self
    const t = arrayTarget(self)
    if (t) track(t, ITER)
    const base = t ?? self
    let r = native.apply(base, args)
    if (r !== miss) return r
    const arg = args[0]
    const alt = toRaw(arg)
    if (alt !== arg) {
      r = native.call(base, alt, ...args.slice(1))
      if (r !== miss) return r
    }
    const p = typeof alt === 'object' && alt !== null ? proxies.get(alt) : undefined
    return p && p !== arg ? native.call(base, p, ...args.slice(1)) : r
  }
}

// Iteradores: assinam `$iter` na chamada e percorrem o raw.
function* iterValues(t: AnyArray): Generator<unknown> {
  for (let i = 0; i < t.length; i++) yield toReactive(t[i])
}
function* iterEntries(t: AnyArray): Generator<[number, unknown]> {
  for (let i = 0; i < t.length; i++) yield [i, toReactive(t[i])]
}
const nativeValues = proto.values!
const nativeEntries = proto.entries!
const nativeKeys = proto.keys!
arrayMethods.values = arrayMethods[Symbol.iterator] = function (this: unknown) {
  const t = arrayTarget(this)
  if (!t) return nativeValues.call(this)
  track(t, ITER)
  return iterValues(t)
}
arrayMethods.entries = function (this: unknown) {
  const t = arrayTarget(this)
  if (!t) return nativeEntries.call(this)
  track(t, ITER)
  return iterEntries(t)
}
arrayMethods.keys = function (this: unknown) {
  const t = arrayTarget(this)
  if (!t) return nativeKeys.call(this)
  track(t, ITER)
  return nativeKeys.call(t)
}

// ─── Readonly (dev) ──────────────────────────────────────────────────────────

type Diagnostic = 'derived-mutated' | 'store-mutated-outside-action'

/** readonly proxy → valor embrulhado (proxy reativo ou raw). */
const roTargets = new WeakMap<object, object>()
/** valor embrulhado → (diagnóstico + meta) → readonly proxy. */
const roCache = new WeakMap<object, Map<string, object>>()

function roHandler(diagnostic: Diagnostic, dev: DevMeta | undefined): ProxyHandler<object> {
  const denied = (key: PropertyKey): true => {
    const k = String(key)
    const name = dev?.name ? ` "${dev.name}"` : ''
    warn(
      diagnostic,
      diagnostic === 'derived-mutated'
        ? `escrita em "${k}" no resultado do derivado${name}; derivados são somente leitura (o valor não muda)`
        : `escrita direta em "${k}" no store${name} fora de uma ação (o valor não muda)`,
      dev?.loc,
    )
    return true
  }
  return {
    get(t, key) {
      if (Array.isArray(t) && hasOwn(arrayMethods, key)) return arrayMethods[key as string]
      const v = Reflect.get(t, key, t)
      if (typeof v !== 'object' || v === null) return v
      const base = toRaw(t)
      if (!Object.isExtensible(base)) {
        const d = Object.getOwnPropertyDescriptor(base, key)
        if (d && !d.configurable && !d.writable) return v
      }
      return readonly(v, diagnostic, dev)
    },
    set: (_t, key) => denied(key),
    deleteProperty: (_t, key) => denied(key),
    defineProperty: (_t, key) => denied(key),
    setPrototypeOf: () => denied('__proto__'),
  }
}

/** Dev only. Proxy que avisa em escrita (diagnóstico + loc) e não muda o valor. Em prod devolve `v`. */
export function readonly<T>(v: T, diagnostic: Diagnostic, dev?: DevMeta): T {
  if (!DEV) return v
  if (typeof v !== 'object' || v === null || roTargets.has(v)) return v
  if (!isPlainShape(targets.get(v) ?? v)) return v
  const key = `${diagnostic}\0${dev?.name ?? ''}\0${dev?.loc ?? ''}`
  let cache = roCache.get(v)
  if (!cache) roCache.set(v, (cache = new Map()))
  let p = cache.get(key)
  if (!p) {
    p = new Proxy(v, roHandler(diagnostic, dev))
    cache.set(key, p)
    roTargets.set(p, v)
  }
  return p as T
}

// ─── Comparação rasa ─────────────────────────────────────────────────────────

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
