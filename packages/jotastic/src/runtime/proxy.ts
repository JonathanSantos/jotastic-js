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

/**
 * Estado de um proxy reativo. É o próprio handler do proxy (`this` nas armadilhas): os signals por chave ficam nele,
 * sem um WeakMap a mais por objeto nem consulta a cada leitura.
 */
interface Meta extends ProxyHandler<object> {
  /** alvo raw */
  t: object
  /** o proxy */
  p: object
  /** signals por chave (criados sob demanda) */
  m: Map<PropertyKey, Signal<number>> | null
}

/** raw → meta */
const proxies = new WeakMap<object, Meta>()
/** Chave interna: `proxy[META]` devolve o meta (a armadilha `get` responde); sem WeakMap proxy → raw. */
const META: unique symbol = Symbol()

/** Meta de `v` se `v` é um proxy reativo (não um objeto que o herda como protótipo, nem um readonly por cima). */
function metaOf(v: object): Meta | undefined {
  const h = (v as { [META]?: Meta })[META]
  return h !== undefined && h.p === v ? h : undefined
}

/** Valores marcados com `raw()`: nunca proxiados. */
const marked = new WeakSet<object>()

/** Símbolo bem conhecido (`Symbol.iterator`…): descrição "Symbol.x" e `Symbol.x` é ele mesmo. Não é rastreado. */
function isWellKnown(k: symbol): boolean {
  return (Symbol as unknown as Record<string, unknown>)[String(k.description).slice(7)] === k
}

function isPlainShape(v: object): boolean {
  const proto = Object.getPrototypeOf(v)
  return Array.isArray(v) ? proto === Array.prototype : proto === Object.prototype || proto === null
}

/** POJO/array raw ainda não marcado com `raw()` (e que não é um proxy nosso). */
function isProxiable(v: unknown): v is object {
  // Forma primeiro (sem consultar WeakMaps); readonly só existe em dev.
  return (
    typeof v === 'object' && v !== null && isPlainShape(v) && !marked.has(v) && !metaOf(v) && !(DEV && roTargets.has(v))
  )
}

function isIndex(key: PropertyKey): key is string {
  return typeof key === 'string' && key !== '' && String(Number(key) >>> 0) === key && key !== '4294967295'
}

// ─── Rastreamento ────────────────────────────────────────────────────────────

function track(h: Meta, key: PropertyKey): void {
  if (!isTracking()) return
  if (typeof key === 'symbol' && isWellKnown(key)) return
  const m = (h.m ??= new Map())
  let s = m.get(key)
  if (!s) m.set(key, (s = signal(0)))
  s.get()
}

function bump(s: Signal<number> | undefined): void {
  if (s) s.set(s.peek() + 1)
}

function notify(h: Meta, key: PropertyKey): void {
  if (h.m) bump(h.m.get(key))
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
  // Readonly só existe em dev.
  if (DEV) {
    const ro = roTargets.get(x)
    if (ro) x = ro
  }
  return (metaOf(x)?.t ?? x) as T
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
  // Caminho rápido: já tem proxy (`raw()` tira o alvo daqui ao marcá-lo).
  let h = proxies.get(target)
  if (h) return h.p as T
  if (!isProxiable(target)) return target
  h = Object.create(Array.isArray(target) ? arrayHandler : objectHandler) as Meta
  h.t = target
  h.m = null
  h.p = new Proxy(target, h)
  proxies.set(target, h)
  return h.p as T
}

/** Proxy (reativo ou readonly) → alvo. POJO/array raw → marcado para nunca ser proxiado. Outros: identidade. */
export function raw<T>(v: T): T {
  if (typeof v !== 'object' || v === null) return v
  // Readonly só existe em dev.
  const ro = DEV && roTargets.get(v)
  if (ro) return raw(ro as T)
  const h = metaOf(v)
  if (h) return h.t as T
  if (isPlainShape(v)) {
    marked.add(v)
    proxies.delete(v)
  }
  return v
}

export function isReactive(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const ro = DEV && roTargets.get(v)
  return metaOf(ro || v) !== undefined
}

/** Equivalente a `reactive` para o `state()`: POJO/array → proxy, senão identidade. */
export function toReactive<T>(v: T): T {
  return typeof v === 'object' && v !== null ? reactive(v) : v
}

// ─── Handlers ────────────────────────────────────────────────────────────────

const hasOwn: (o: object, k: PropertyKey) => boolean = Object.hasOwn

const objectHandler: ProxyHandler<object> = {
  get(this: Meta, t, key, receiver) {
    if (key === META) return this
    const v = Reflect.get(t, key, receiver)
    track(this, key)
    return wrapProp(t, key, v)
  },
  has(this: Meta, t, key) {
    track(this, ITER)
    return Reflect.has(t, key)
  },
  ownKeys(this: Meta, t) {
    track(this, ITER)
    return Reflect.ownKeys(t)
  },
  set(this: Meta, t, key, value, receiver) {
    // Escrita herdada (o proxy é protótipo de outro objeto): comportamento padrão.
    if (receiver !== this.p) return Reflect.set(t, key, value, receiver)
    const d = Object.getOwnPropertyDescriptor(t, key)
    if (d && (d.get || d.set)) return Reflect.set(t, key, value, receiver)
    const next = toRaw(value)
    if (d && Object.is(d.value, next)) return true
    if (Array.isArray(t)) return setArray(this, t, key, next, d !== undefined)
    if (!Reflect.set(t, key, next)) return false
    notify(this, key)
    if (!d) notify(this, ITER)
    return true
  },
  deleteProperty(this: Meta, t, key) {
    const had = hasOwn(t, key)
    const ok = Reflect.deleteProperty(t, key)
    if (had && ok) {
      notify(this, key)
      notify(this, ITER)
    }
    return ok
  },
  defineProperty(this: Meta, t, key, desc) {
    const had = hasOwn(t, key)
    if ('value' in desc) desc = { ...desc, value: toRaw(desc.value) }
    const ok = Reflect.defineProperty(t, key, desc)
    if (ok) {
      notify(this, key)
      if (!had || Array.isArray(t)) notify(this, ITER)
    }
    return ok
  },
}

function setArray(h: Meta, t: AnyArray, key: PropertyKey, next: unknown, had: boolean): boolean {
  const oldLen = t.length
  if (!Reflect.set(t, key, next)) return false
  const m = h.m
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
  get(this: Meta, t, key, receiver) {
    if (key === META) return this
    if (hasOwn(arrayMethods, key)) return arrayMethods[key as string]
    const v = Reflect.get(t, key, receiver)
    track(this, key)
    return wrapProp(t, key, v)
  },
}

// ─── Métodos de array ────────────────────────────────────────────────────────

/**
 * Tabela de métodos de array instrumentados. Criada por uma função marcada `@__PURE__` para que o bundler a descarte
 * quando nada do proxy é usado (o módulo cai no mesmo chunk de `reactive`/`memo`).
 */
const arrayMethods: Record<PropertyKey, AnyFn> = /* @__PURE__ */ createArrayMethods()

/** Meta quando `self` é um proxy reativo de array; senão undefined (chamada genérica pelo nativo). */
function arrayMeta(self: unknown): Meta | undefined {
  return typeof self === 'object' && self !== null ? metaOf(self) : undefined
}

// Iteradores de `values`/`entries`: percorrem o raw entregando proxies.
function* iterate(t: AnyArray, entries: boolean): Generator<unknown> {
  for (let i = 0; i < t.length; i++) yield entries ? [i, toReactive(t[i])] : toReactive(t[i])
}

function createArrayMethods(): Record<PropertyKey, AnyFn> {
  const arrayMethods: Record<PropertyKey, AnyFn> = Object.create(null)
  const proto = Array.prototype as unknown as Record<PropertyKey, AnyFn>

  // Mutadores: rodam no raw (args desembrulhados) em batch, sem rastrear; notificam o que mudou.
  for (const name of ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']) {
    const native = proto[name]!
    arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
      const h = arrayMeta(this)
      if (!h) return native.apply(this, args)
      const t = h.t as AnyArray
      const self = this
      return batch(() =>
        untrack(() => {
          let a = args.map(toRaw)
          if (name === 'sort' && typeof args[0] === 'function') {
            const cmp = args[0] as AnyFn
            a = [(x: unknown, y: unknown) => cmp(toReactive(x), toReactive(y))]
          }
          const m = h.m
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

  /**
   * Métodos sem mutação: rodam no raw assinando `$iter`. `wrap` adapta o callback (elementos entregues como proxy);
   * `kind` converte o resultado: 1 = elemento, 2 = array de elementos, 3 = roda sobre uma cópia com os elementos já
   * como proxy (reduce: o acumulador inicial implícito também; buracos e o TypeError de array vazio ficam com o nativo).
   */
  const def = (names: string, kind: 0 | 1 | 2 | 3, wrap?: (cb: AnyFn, self: unknown, thisArg: unknown) => AnyFn) => {
    for (const name of names.split(' ')) {
      const native = proto[name]
      if (native)
        arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
          const h = arrayMeta(this)
          if (!h) return native.apply(this, args)
          track(h, ITER)
          if (wrap && typeof args[0] === 'function') args[0] = wrap(args[0] as AnyFn, this, args[1])
          const r = native.apply(kind === 3 ? (h.t as AnyArray).map(toReactive) : h.t, args)
          return kind === 1 ? toReactive(r) : kind === 2 ? (r as AnyArray).map(toReactive) : r
        }
    }
  }
  const each = (cb: AnyFn, self: unknown, thisArg: unknown) => (v: unknown, i: number) =>
    cb.call(thisArg, toReactive(v), i, self)
  def('forEach map flatMap findIndex findLastIndex some every', 0, each)
  def('filter', 2, each)
  def('find findLast', 1, each)
  def('slice concat toReversed toSpliced with', 2)
  def('at', 1)
  def('join toString toLocaleString', 0)
  def('toSorted', 2, (cmp) => (x: unknown, y: unknown) => cmp(toReactive(x), toReactive(y)))
  def('reduce reduceRight', 3, (cb, self) => (acc: unknown, v: unknown, i: number) => cb(acc, v, i, self))

  // Busca: tenta com o argumento, com o raw dele e com o proxy do raw (o array pode guardar proxies).
  for (const name of ['includes', 'indexOf', 'lastIndexOf']) {
    const native = proto[name]!
    const miss = name === 'includes' ? false : -1
    arrayMethods[name] = function (this: unknown, ...args: unknown[]) {
      let self = this
      if (DEV && typeof self === 'object' && self !== null) self = roTargets.get(self) ?? self
      const h = arrayMeta(self)
      if (h) track(h, ITER)
      const base = h ? h.t : self
      let r = native.apply(base, args)
      if (r !== miss) return r
      const arg = args[0]
      const alt = toRaw(arg)
      if (alt !== arg) {
        r = native.call(base, alt, ...args.slice(1))
        if (r !== miss) return r
      }
      const p = typeof alt === 'object' && alt !== null ? proxies.get(alt)?.p : undefined
      return p && p !== arg ? native.call(base, p, ...args.slice(1)) : r
    }
  }

  // Iteradores: assinam `$iter`; valores e entradas saem como proxy.
  for (const name of ['values', 'entries', 'keys']) {
    const native = proto[name]!
    arrayMethods[name] = function (this: unknown) {
      const h = arrayMeta(this)
      if (!h) return native.call(this)
      track(h, ITER)
      return name === 'keys' ? native.call(h.t) : iterate(h.t as AnyArray, name === 'entries')
    }
  }
  arrayMethods[Symbol.iterator] = arrayMethods.values!
  return arrayMethods
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
      if (key === META) return undefined
      if (Array.isArray(t) && hasOwn(arrayMethods, key)) return arrayMethods[key as string]
      const v = Reflect.get(t, key, t)
      if (typeof v !== 'object' || v === null) return v
      // Derivado: valores aninhados que são estado (proxy reativo, ex.: itens de `todos.filter(…)`) pertencem à fonte,
      // não ao derivado; escrever neles é legítimo (`todo.done = v` em 02-todos) e igual a prod. Store: profundo.
      if (diagnostic === 'derived-mutated' && metaOf(v)) return v
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
  if (!isPlainShape(metaOf(v)?.t ?? v)) return v
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
