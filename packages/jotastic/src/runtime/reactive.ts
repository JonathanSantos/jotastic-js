// Núcleo reativo: push-pull com coloração (CLEAN / CHECK / DIRTY).
//
// Push: `signal.set` marca observadores diretos como DIRTY e, através de memos, os transitivos como CHECK.
//       Efeitos marcados entram numa das duas filas (render / user), ordenadas por id.
// Pull: um nó CHECK pergunta às fontes memo (recalculando-as) se mudaram; se nenhuma mudou, volta a CLEAN sem rodar.

import { devtoolsHook, emitDevtools, stats, warn } from './devtools'
import { DEV } from './env'
import {
  disposeScope,
  getOwner,
  handleError,
  jotasticError,
  nextId,
  registerDisposable,
  setOwner,
  type Cleanup,
  type DevMeta,
  type Dispose,
  type BoundaryHandle,
  type Disposable,
  type ErrorInfo,
  type Owner,
  type OwnerImpl,
} from './owner'
import { readonly, toReactive } from './proxy'
import { shallowEqual } from './shallow'

export interface Signal<T> {
  get(): T
  set(next: T): void
  peek(): T
}

export interface Memo<T> {
  get(): T
  peek(): T
}

export interface MemoOptions<T> extends DevMeta {
  equals?: ((a: T, b: T) => boolean) | false
}

export interface EffectOptions extends DevMeta {
  kind?: 'render' | 'user'
}

const CLEAN = 0
const CHECK = 1
const DIRTY = 2
type State = typeof CLEAN | typeof CHECK | typeof DIRTY

/** Execuções do mesmo efeito dentro de um único flush antes de `effect-loop`. */
const LOOP_LIMIT = 100
const NO_ERROR: unknown = Symbol('no-error')

type Source = SignalNode<any> | MemoNode<any>
type Computation = MemoNode<any> | EffectNode

let currentObserver: Computation | null = null
let currentEffect: EffectNode | null = null
let ambientSignal: AbortSignal | null = null
let neverAborts: AbortSignal | null = null

function track(source: Source): void {
  const obs = currentObserver
  if (obs !== null && !obs.sources.has(source)) {
    obs.sources.add(source)
    source.observers.add(obs)
  }
}

function clearSources(c: Computation): void {
  for (const s of c.sources) s.observers.delete(c)
  c.sources.clear()
}

/** Eleva o estado de `c`. Ao sair de CLEAN: memo propaga CHECK; efeito entra na fila. */
function mark(c: Computation, state: State): void {
  if (c.state >= state) return
  const wasClean = c.state === CLEAN
  c.state = state
  if (!wasClean) return
  if (c instanceof EffectNode) enqueue(c)
  else for (const o of c.observers) mark(o, CHECK)
}

/** Resolve um CHECK: recalcula as fontes memo marcadas até alguma mudar (→ DIRTY) ou acabarem (→ CLEAN). */
function resolveCheck(c: Computation): void {
  if (c.state !== CHECK) return
  for (const s of c.sources) {
    if (s instanceof MemoNode && s.state !== CLEAN) {
      s.update()
      if ((c.state as State) === DIRTY) return
    }
  }
  c.state = CLEAN
}

// ─── Signal ──────────────────────────────────────────────────────────────────

class SignalNode<T> implements Signal<T> {
  readonly id = nextId()
  observers = new Set<Computation>()
  // `declare` + atribuição no construtor (em vez de parameter properties): não emite declarações de campo repetidas.
  declare value: T
  declare private wrap: ((v: T) => T) | null
  constructor(value: T, wrap: ((v: T) => T) | null) {
    this.value = value
    this.wrap = wrap
  }

  get(): T {
    track(this)
    return this.value
  }

  peek(): T {
    return this.value
  }

  set(next: T): void {
    if (this.wrap) next = this.wrap(next)
    const prev = this.value
    if (Object.is(prev, next)) return
    this.value = next
    if (DEV && devtoolsHook()) {
      emitDevtools({ type: 'signal:set', id: this.id, prev, next, flush: flushing ? stats.flush : stats.flush + 1 })
      flushCause ??= this.id
    }
    for (const o of this.observers) mark(o, DIRTY)
  }
}

/** Interno (dev, HMR): vê cada signal com `dev.hash` ao nascer; `{ value }` troca o valor inicial (preserveState). */
type HmrSignalHook = (s: Signal<unknown>, dev: DevMeta) => { value: unknown } | undefined
let hmrSignalHook: HmrSignalHook | null = null
export function setHmrSignalHook(hook: HmrSignalHook | null): void {
  hmrSignalHook = hook
}

function createSignal<T>(initial: T, wrap: ((v: T) => T) | null, dev?: DevMeta): Signal<T> {
  const s = new SignalNode(wrap ? wrap(initial) : initial, wrap)
  if (DEV && hmrSignalHook && dev?.hash !== undefined) {
    const kept = hmrSignalHook(s as Signal<unknown>, dev)
    if (kept) s.value = wrap ? wrap(kept.value as T) : (kept.value as T)
  }
  if (DEV && devtoolsHook()) {
    const owner = getOwner()
    emitDevtools({
      type: 'signal:create',
      id: s.id,
      owner: owner ? owner.id : null,
      name: dev?.name,
      loc: dev?.loc,
      value: s.value,
    })
  }
  return s
}

export function signal<T>(initial: T, dev?: DevMeta): Signal<T> {
  return createSignal(initial, null, dev)
}

/** Signal que passa POJO/array por `toReactive` ao entrar (na criação e em cada `set`). */
export function state<T>(initial: T, dev?: DevMeta): Signal<T> {
  return createSignal(initial, toReactive, dev)
}

// ─── Memo ────────────────────────────────────────────────────────────────────

function defaultEquals(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || shallowEqual(a, b)
}

function isPlainOrArray(v: unknown): v is object {
  if (typeof v !== 'object' || v === null) return false
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

class MemoNode<T> implements Memo<T> {
  readonly id = nextId()
  state: State = CLEAN
  sources = new Set<Source>()
  observers = new Set<Computation>()
  value!: T
  error: unknown = NO_ERROR
  /** `true` se a primeira execução não leu nenhuma fonte: o valor é fixo e `fn` foi liberada. */
  constant = false
  runs = 0
  /** Dev: já avisou `derived-recreates-instance`. */
  declare private warnedInstance?: boolean
  declare private fn: (() => T) | null
  declare private equals: ((a: T, b: T) => boolean) | false
  declare readonly owner: Owner | null
  declare readonly dev: DevMeta | undefined

  constructor(
    fn: (() => T) | null,
    equals: ((a: T, b: T) => boolean) | false,
    owner: Owner | null,
    dev: DevMeta | undefined,
  ) {
    this.fn = fn
    this.equals = equals
    this.owner = owner
    this.dev = dev
  }

  get(): T {
    if (!this.constant) {
      if (this.state !== CLEAN) this.update()
      track(this)
    }
    return this.read()
  }

  peek(): T {
    if (this.state !== CLEAN) this.update()
    return this.read()
  }

  private read(): T {
    if (this.error !== NO_ERROR) throw this.error
    const v = this.value
    return DEV && isPlainOrArray(v) ? readonly(v, 'derived-mutated', this.dev) : v
  }

  /** Pull: resolve CHECK e recalcula se DIRTY. */
  update(): void {
    resolveCheck(this)
    if (this.state === DIRTY) this.run()
  }

  run(): void {
    const prev = this.value
    const prevError = this.error
    this.state = CLEAN
    clearSources(this)
    const prevObserver = currentObserver
    const prevEffect = currentEffect
    const prevOwner = setOwner(this.owner)
    currentObserver = this
    currentEffect = null
    let next: T | undefined
    let error = NO_ERROR
    try {
      next = this.fn!()
    } catch (e) {
      error = e
    } finally {
      currentObserver = prevObserver
      currentEffect = prevEffect
      setOwner(prevOwner)
    }
    const first = this.runs++ === 0
    let changed: boolean
    if (error !== NO_ERROR) {
      this.error = error
      changed = true
    } else {
      this.error = NO_ERROR
      changed = first || prevError !== NO_ERROR || this.equals === false || !this.equals(prev, next as T)
      if (changed) this.value = next as T
    }
    if (DEV) {
      if (!first && changed && !this.warnedInstance && hasLifecycle(next)) {
        this.warnedInstance = true
        warn(
          'derived-recreates-instance',
          `o derivado${this.dev?.name ? ` "${this.dev.name}"` : ''} recria uma instância com ciclo de vida a cada mudança (a anterior não é destruída); use external com update`,
          this.dev?.loc,
        )
      }
      if (devtoolsHook()) {
        emitDevtools({ type: 'memo:run', id: this.id, prev, next, changed, flush: stats.flush })
      }
    }
    if (changed && !first) for (const o of this.observers) mark(o, DIRTY)
  }

  dispose(): void {
    clearSources(this)
  }
}

/** Métodos que indicam um recurso com ciclo de vida (C-2). Objetos de plataforma sem eles (MediaQueryList) não avisam. */
const LIFECYCLE = ['destroy', 'dispose', 'disconnect', 'close', 'unsubscribe', 'abort'] as const

/** Instância (não POJO/array) com algum método de ciclo de vida: recriá-la a cada mudança provavelmente vaza. */
function hasLifecycle(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || isPlainOrArray(v)) return false
  for (const m of LIFECYCLE) if (typeof (v as Record<string, unknown>)[m] === 'function') return true
  return false
}

/**
 * Derivado memoizado. Roda `fn` na criação; sem leituras reativas vira constante; depois é lazy (pull).
 * Exceção na criação propaga para quem criou; exceção num recálculo propaga para quem chamou `get()`.
 */
export function memo<T>(fn: () => T, opts?: MemoOptions<T>): Memo<T> {
  const owner = getOwner()
  const equals = opts?.equals === undefined ? defaultEquals : opts.equals
  const m = new MemoNode<T>(fn, equals, owner, DEV ? opts : undefined)
  m.run()
  if (m.error !== NO_ERROR) {
    clearSources(m)
    throw m.error
  }
  if (m.sources.size === 0) {
    m.constant = true
    ;(m as unknown as { fn: null }).fn = null
  } else if (owner) {
    registerDisposable(owner, m)
  }
  if (DEV && devtoolsHook()) {
    emitDevtools({
      type: 'memo:create',
      id: m.id,
      owner: owner ? owner.id : null,
      name: opts?.name,
      loc: opts?.loc,
      constant: m.constant,
    })
  }
  return m
}

// ─── Effect ──────────────────────────────────────────────────────────────────

/**
 * O efeito é um escopo (D-N4/N5, modelo do Solid): durante `run` ele é o owner atual, então `onCleanup`, efeitos, memos
 * e owners criados na execução pertencem a ela e são descartados antes da próxima e no dispose. Sem alocação extra:
 * os campos de owner ficam vazios até alguém registrar algo.
 */
class EffectNode implements OwnerImpl {
  readonly id = nextId()
  state: State = CLEAN
  sources = new Set<Source>()
  cleanup: Cleanup | null = null
  controller: AbortController | null = null
  queued = false
  disposed = false
  /** Loop guard: flush em que `runs` foi contado. */
  stamp = 0
  runs = 0
  // Owner (escopo da execução corrente). Sem `name`: `handleError` usa o nome do componente acima.
  readonly kind = 'effect' as const
  context: Map<symbol, unknown> | null = null
  children: Set<OwnerImpl> | null = null
  disposables: Disposable[] | null = null
  onError: ((error: unknown, info: ErrorInfo) => void) | null = null
  declare readonly depth: number
  declare boundary: BoundaryHandle | null
  declare private fn: () => void | Cleanup
  /** Owner onde o efeito foi criado (o `parent` do escopo). */
  declare readonly parent: Owner | null
  /** Fila: `render` (bindings, primeira execução síncrona) ou `user`. */
  declare readonly type: 'render' | 'user'

  constructor(fn: () => void | Cleanup, parent: Owner | null, kind: 'render' | 'user') {
    this.fn = fn
    this.parent = parent
    this.depth = parent ? parent.depth + 1 : 0
    this.boundary = parent ? parent.boundary : null
    this.type = kind
  }

  run(): void {
    this.state = CLEAN
    this.runCleanup()
    clearSources(this)
    const prevObserver = currentObserver
    const prevEffect = currentEffect
    const prevAmbient = ambientSignal
    const prevOwner = setOwner(this)
    currentObserver = this
    currentEffect = this
    ambientSignal = null
    const hook = DEV ? devtoolsHook() : undefined
    const start = hook ? performance.now() : 0
    try {
      const r = this.fn()
      if (typeof r === 'function') this.cleanup = r
    } catch (e) {
      handleError(this.parent, e, this.type === 'render' ? 'binding' : 'effect')
    } finally {
      currentObserver = prevObserver
      currentEffect = prevEffect
      ambientSignal = prevAmbient
      setOwner(prevOwner)
    }
    if (DEV) {
      stats.effects++
      if (hook)
        hook.emit({ type: 'effect:run', id: this.id, durationMs: performance.now() - start, flush: stats.flush })
    }
  }

  /**
   * Fim da execução anterior (sem rastrear): aborta o `abortSignal()` dela, roda o cleanup devolvido e descarta o
   * escopo (owners filhos, efeitos/memos internos, `onCleanup`), nessa ordem.
   */
  private runCleanup(): void {
    const c = this.cleanup
    const ctrl = this.controller
    this.cleanup = null
    this.controller = null
    if (ctrl) ctrl.abort()
    if (!c && !this.children && !this.disposables) return
    const prev = currentObserver
    currentObserver = null
    try {
      if (c) c()
    } catch (e) {
      handleError(this.parent, e, 'effect')
    } finally {
      try {
        disposeScope(this)
      } finally {
        currentObserver = prev
      }
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    clearSources(this)
    this.runCleanup()
  }
}

/**
 * Efeito com rastreamento automático. `render`: primeira execução síncrona; `user` (padrão): no próximo flush.
 * Pertence ao owner atual. Fora de owner: erro `use-outside-owner` em dev (roteado por handleError), vive para sempre.
 */
export function effect(fn: () => void | Cleanup, opts?: EffectOptions): Dispose {
  const owner = getOwner()
  const kind = opts?.kind ?? 'user'
  if (DEV && !owner) {
    handleError(
      null,
      jotasticError('use-outside-owner', `efeito${opts?.name ? ` "${opts.name}"` : ''} criado fora de um owner`),
      kind === 'render' ? 'binding' : 'effect',
    )
  }
  const e = new EffectNode(fn, owner, kind)
  if (owner) registerDisposable(owner, e)
  if (DEV && devtoolsHook()) {
    emitDevtools({
      type: 'effect:create',
      id: e.id,
      owner: owner ? owner.id : null,
      kind,
      name: opts?.name,
      loc: opts?.loc,
    })
  }
  if (kind === 'render') e.run()
  else mark(e, DIRTY)
  return () => e.dispose()
}

/** Thunk compartilhado para parâmetros ausentes de `use*` (D59): `function useX(a = _void)`. */
export const _void = (): undefined => undefined

// ─── Rastreamento ────────────────────────────────────────────────────────────

export function untrack<T>(fn: () => T): T {
  const prev = currentObserver
  currentObserver = null
  try {
    return fn()
  } finally {
    currentObserver = prev
  }
}

export function isTracking(): boolean {
  return currentObserver !== null
}

/** Interno (para testes): quantos observadores um signal/memo tem agora. */
export function observerCount(s: Signal<unknown> | Memo<unknown>): number {
  return (s as unknown as { observers: Set<unknown> }).observers.size
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

/** Fila ordenada por id. Inserções quase sempre chegam em ordem crescente (append). */
class Queue {
  private items: (EffectNode | undefined)[] = []
  private head = 0

  get size(): number {
    return this.items.length - this.head
  }

  push(e: EffectNode): void {
    // Varre do fim: em ordem é O(1); fora de ordem o custo é o do `splice`, que já é linear.
    const a = this.items
    let i = a.length
    while (i > this.head && a[i - 1]!.id > e.id) i--
    a.splice(i, 0, e)
  }

  shift(): EffectNode | undefined {
    if (this.head === this.items.length) return undefined
    const e = this.items[this.head]
    this.items[this.head++] = undefined
    if (this.head === this.items.length) {
      this.items.length = 0
      this.head = 0
    }
    return e
  }
}

const renderQueue = new Queue()
const userQueue = new Queue()
let scheduled = false
let flushing = false
let batchDepth = 0
let flushRequested = false
let flushCause: number | null = null
let tickResolvers: (() => void)[] = []

function enqueue(e: EffectNode): void {
  if (e.queued || e.disposed) return
  e.queued = true
  ;(e.type === 'render' ? renderQueue : userQueue).push(e)
  if (!scheduled) {
    scheduled = true
    queueMicrotask(onMicrotask)
  }
}

function onMicrotask(): void {
  scheduled = false
  flush()
}

/**
 * Processa as filas agora: sempre o efeito de render de menor id; quando a fila de render está vazia, o de usuário
 * de menor id. Repete até esvaziar (efeitos criados/marcados durante o flush entram no mesmo flush).
 */
export function flush(): void {
  if (batchDepth > 0) {
    flushRequested = true
    return
  }
  if (flushing) return
  if (renderQueue.size === 0 && userQueue.size === 0) {
    resolveTicks()
    return
  }
  flushing = true
  const id = ++stats.flush
  const hook = DEV ? devtoolsHook() : undefined
  const start = hook ? performance.now() : 0
  if (DEV) {
    stats.effects = 0
    stats.writes = 0
    if (hook)
      hook.emit({ type: 'flush:start', flush: id, cause: flushCause !== null ? { signal: flushCause } : undefined })
    flushCause = null
  }
  try {
    let e: EffectNode | undefined
    while ((e = renderQueue.shift() ?? userQueue.shift()) !== undefined) {
      e.queued = false
      if (e.disposed || (e.parent && e.parent.disposed)) continue
      resolveCheck(e)
      if (e.state !== DIRTY) continue
      if (e.stamp !== id) {
        e.stamp = id
        e.runs = 0
      }
      if (++e.runs > LOOP_LIMIT) {
        // Interrompe o ciclo: o efeito continua assinado, mas não roda de novo neste flush.
        e.state = CLEAN
        handleError(
          e.parent,
          jotasticError('effect-loop', DEV ? `efeito executou ${LOOP_LIMIT} vezes no mesmo flush` : ''),
          'effect',
        )
        continue
      }
      e.run()
    }
  } finally {
    flushing = false
    if (renderQueue.size || userQueue.size) {
      // Saída por exceção (modo de teste): o resto fica para o próximo microtask.
      if (!scheduled) {
        scheduled = true
        queueMicrotask(onMicrotask)
      }
    }
    if (hook) {
      hook.emit({
        type: 'flush:end',
        flush: id,
        effects: stats.effects,
        writes: stats.writes,
        durationMs: performance.now() - start,
      })
    }
    resolveTicks()
  }
}

function resolveTicks(): void {
  if (tickResolvers.length === 0) return
  const rs = tickResolvers
  tickResolvers = []
  for (const r of rs) r()
}

/** Agrupa escritas: `flush()` chamado dentro de `fn` só acontece ao sair do batch mais externo. */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    if (--batchDepth === 0 && flushRequested) {
      flushRequested = false
      flush()
    }
  }
}

/** Promise resolvida depois do próximo flush (ou imediatamente se não há nada agendado). */
export function tick(): Promise<void> {
  if (!scheduled && !flushing && renderQueue.size === 0 && userQueue.size === 0) return Promise.resolve()
  return new Promise((resolve) => tickResolvers.push(resolve))
}

// ─── AbortSignal ambiente ────────────────────────────────────────────────────

/** Signal ambiente: o publicado por `withAbortSignal` (resource), senão o do efeito em execução, senão um que nunca aborta. */
export function abortSignal(): AbortSignal {
  if (ambientSignal) return ambientSignal
  if (currentEffect) return (currentEffect.controller ??= new AbortController()).signal
  return (neverAborts ??= new AbortController().signal)
}

/** Interno (para `resource`): publica `signal` como ambiente durante a parte síncrona de `fn`. */
export function withAbortSignal<T>(signal: AbortSignal, fn: () => T): T {
  const prev = ambientSignal
  ambientSignal = signal
  try {
    return fn()
  } finally {
    ambientSignal = prev
  }
}
