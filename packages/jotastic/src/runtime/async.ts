// Async: resource, continuation, boundary (ver docs/spec/contracts/runtime.d.ts §Async, 07-async.md, 09-erros.md).
//
// `resource` roda `fn` num efeito de render; `continuation` cria o conteúdo depois do `await` quando o recurso tem valor;
// `boundary` junta pending (recursos rastreados no primeiro carregamento) e erro (qualquer fase) numa fronteira.

import type { Rendered } from './flow'
import {
  createOwner,
  dispose,
  getOwner,
  handleError,
  registerDisposable,
  runWithOwner,
  type BoundaryHandle,
  type DevMeta,
  type Owner,
} from './owner'
import { renderEffect, memo, signal, state, untrack, withAbortSignal, type Signal } from './reactive'

export interface Resource<T> {
  readonly value: Signal<T | undefined>
  readonly error: Signal<unknown>
  /** true até o PRIMEIRO valor ou erro. */
  readonly loading: Signal<boolean>
  /** true enquanto uma reexecução está em andamento depois do primeiro valor. */
  readonly pending: Signal<boolean>
  /** Reexecuta `fn` mantendo `value` (stale-while-revalidate). */
  refresh(): void
  readonly version: number
}

/** Roda `fn` sem rastrear dentro de `owner`. Erro → `handleError(owner, e, 'setup')` e null. */
function renderIn(owner: Owner, fn: () => Rendered): Rendered {
  try {
    return runWithOwner(owner, () => untrack(fn))
  } catch (e) {
    handleError(owner, e, 'setup')
    return null
  }
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (typeof v === 'object' || typeof v === 'function') && v !== null && typeof (v as any).then === 'function'
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'
}

// ─── resource ────────────────────────────────────────────────────────────────

/**
 * Recurso reativo para `await` no corpo do componente. A cada execução do efeito: aborta o controller anterior, cria um
 * novo, chama `fn(signal)` com ele publicado como signal ambiente (só na parte síncrona) e incrementa `version`.
 * Resolução de versão antiga ou `AbortError` → ignorada. Dispose do owner → aborta; nenhum `set` depois.
 */
export function resource<T>(fn: (signal: AbortSignal) => Promise<T> | T, dev?: DevMeta): Resource<T> {
  const owner = getOwner()
  const value = state<T | undefined>(undefined, dev)
  const error = signal<unknown>(undefined)
  const loading = signal(true)
  const pending = signal(false)
  const trigger = signal(0)
  let controller: AbortController | null = null
  let version = 0
  let disposed = false

  const succeed = (v: number, result: T) => {
    if (disposed || v !== version) return
    value.set(result)
    error.set(undefined)
    loading.set(false)
    pending.set(false)
  }
  const fail = (v: number, e: unknown) => {
    if (disposed || v !== version || isAbortError(e)) return
    error.set(e)
    loading.set(false)
    pending.set(false)
    handleError(owner, e, 'async')
  }

  const res: Resource<T> = {
    value,
    error,
    loading,
    pending,
    refresh: () => {
      if (!disposed) trigger.set(trigger.peek() + 1)
    },
    get version() {
      return version
    },
  }

  if (owner && owner.boundary) runWithOwner(owner, () => owner.boundary!.track(res))

  renderEffect(() => {
    trigger.get()
    if (controller) controller.abort()
    const ctrl = (controller = new AbortController())
    const v = ++version
    let result: Promise<T> | T
    try {
      result = withAbortSignal(ctrl.signal, () => fn(ctrl.signal))
    } catch (e) {
      untrack(() => fail(v, e))
      return
    }
    untrack(() => {
      if (isThenable(result)) {
        if (!loading.peek()) pending.set(true)
        result.then(
          (val) => succeed(v, val as T),
          (e) => fail(v, e),
        )
      } else succeed(v, result)
    })
  }, dev)

  if (owner)
    registerDisposable(owner, () => {
      disposed = true
      if (controller) controller.abort()
      controller = null
    })

  return res
}

// ─── continuation ────────────────────────────────────────────────────────────

/**
 * Continuação de `await`. Null enquanto o recurso carrega ou está em erro. Quando há valor, cria um owner
 * ('continuation') e roda `fn` UMA vez dentro dele. Recargas não recriam; erro depois de criado → dispose.
 */
export function continuation(res: Resource<unknown>, fn: () => Rendered): () => Rendered {
  const parent = getOwner()
  const out = signal<Rendered>(null)
  let current: Owner | null = null
  renderEffect(() => {
    const ready = !res.loading.get() && res.error.get() === undefined
    untrack(() => {
      if (!ready) {
        if (current) {
          dispose(current)
          current = null
          out.set(null)
        }
        return
      }
      if (current) return
      current = createOwner('continuation', parent)
      out.set(renderIn(current, fn))
    })
  })
  return () => out.get()
}

// ─── boundary ────────────────────────────────────────────────────────────────

export interface BoundaryProps {
  pending?: () => Rendered
  error?: (error: unknown, retry: () => void) => Rendered
  children: () => Rendered
}

const NO_FAILURE = { error: undefined as unknown }

/** `error(e, retry)` sempre recebe `Error`: não-Error lançado vira `Error(String(e))` com o original em `cause`. */
function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e), { cause: e })
}

/**
 * Fronteira de pending + erro (D48). Os children são renderizados já, num owner filho, mas ficam fora do DOM enquanto
 * algum recurso rastreado está `loading` (mostra `pending()`). Erro capturado → dispose dos children e `error(e, retry)`
 * (não-Error embrulhado em `Error`, original em `cause`);
 * `retry` recria do zero. Sem `error`, não captura. As views de pending/erro usam a fronteira de fora.
 */
export function boundary(props: BoundaryProps): () => Rendered {
  const parent = getOwner()
  const outer = parent ? parent.boundary : null
  const owner = createOwner('boundary', parent)
  const tracked = new Set<Resource<unknown>>()
  const trackVersion = signal(0)
  const failure = signal(NO_FAILURE)
  const content = signal<Rendered>(null)
  let childOwner: Owner | null = null

  const bump = () => trackVersion.set(trackVersion.peek() + 1)

  const handle: BoundaryHandle = {
    owner,
    track(res) {
      const r = res as Resource<unknown>
      tracked.add(r)
      bump()
      const o = getOwner()
      if (o && o !== owner) registerDisposable(o, () => tracked.delete(r) && bump())
    },
    catch(error) {
      if (!props.error || owner.disposed) return false
      if (childOwner) {
        const c = childOwner
        childOwner = null
        dispose(c)
      }
      content.set(null)
      failure.set({ error: toError(error) })
      return true
    },
  }
  owner.boundary = handle

  const renderChildren = () => {
    const c = (childOwner = createOwner('branch', owner))
    const r = renderIn(c, props.children)
    if (childOwner === c) content.set(r)
  }

  const retry = () => {
    if (owner.disposed) return
    untrack(() => {
      if (childOwner) {
        const c = childOwner
        childOwner = null
        dispose(c)
      }
      failure.set(NO_FAILURE)
      renderChildren()
    })
  }

  renderChildren()

  return runWithOwner(owner, () => {
    const anyLoading = memo(() => {
      trackVersion.get()
      for (const r of tracked) if (r.loading.get()) return true
      return false
    })
    const mode = memo(() => (failure.get() !== NO_FAILURE ? 'error' : anyLoading.get() ? 'pending' : 'ok'))

    // View de pending/erro num owner próprio, com a fronteira de fora (erro na view sobe).
    const view = signal<Rendered>(null)
    let viewOwner: Owner | null = null
    renderEffect(() => {
      const m = mode.get()
      untrack(() => {
        if (viewOwner) dispose(viewOwner)
        viewOwner = null
        const fn =
          m === 'error'
            ? props.error && (() => props.error!(failure.peek().error, retry))
            : m === 'pending'
              ? props.pending
              : undefined
        if (!fn) return view.set(null)
        viewOwner = createOwner('branch', owner)
        viewOwner.boundary = outer
        view.set(renderIn(viewOwner, fn))
      })
    })

    return () => (mode.get() === 'ok' ? content.get() : view.get())
  })
}
