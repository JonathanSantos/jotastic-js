// Owner tree: escopos de vida (componente, branch, item…) com efeitos, cleanups, filhos, contexto e fronteira de erro.

import { devtoolsHook } from './devtools'
import { DEV } from './env'

export type Cleanup = () => void
export type Dispose = () => void

/** Metadados injetados pelo compilador só em dev. Em prod o argumento é omitido. */
export interface DevMeta {
  name?: string
  loc?: string
}

export type ErrorPhase = 'setup' | 'binding' | 'effect' | 'handler' | 'async'

export interface ErrorInfo {
  phase: ErrorPhase
  owner: Owner
  component?: string
  loc?: string
}

export interface Owner {
  readonly id: number
  readonly parent: Owner | null
  readonly depth: number
  readonly name?: string
  readonly kind: 'root' | 'component' | 'branch' | 'item' | 'continuation' | 'boundary' | 'portal' | 'external'
  disposed: boolean
  context: Map<symbol, unknown> | null
  boundary: BoundaryHandle | null
}

export interface BoundaryHandle {
  readonly owner: Owner
  /** Recursos registrados (para pending). O tipo `Resource` chega com `async.ts`. */
  track(res: unknown): void
  /** Chamado por handleError. Devolve true se tratou. */
  catch(error: unknown, info: ErrorInfo): boolean
}

/** Algo que o owner descarta: uma função de cleanup ou um nó reativo (efeito/memo). */
type Disposable = Cleanup | { dispose(): void }

interface OwnerImpl extends Owner {
  loc?: string
  children: Set<OwnerImpl> | null
  disposables: Disposable[] | null
  onError: ((error: unknown, info: ErrorInfo) => void) | null
}

let ids = 0
/** Interno: contador global de ids (owners e nós reativos). Ordem de criação = ordem de id. */
export function nextId(): number {
  return ++ids
}

let currentOwner: OwnerImpl | null = null
let rethrowUnhandled = false

export function createOwner(kind: Owner['kind'], parent: Owner | null = currentOwner, dev?: DevMeta): Owner {
  const p = parent as OwnerImpl | null
  const owner: OwnerImpl = {
    id: nextId(),
    parent: p,
    depth: p ? p.depth + 1 : 0,
    name: dev?.name,
    loc: dev?.loc,
    kind,
    disposed: false,
    context: null,
    boundary: p ? p.boundary : null,
    children: null,
    disposables: null,
    onError: null,
  }
  if (p) (p.children ??= new Set()).add(owner)
  if (DEV) {
    const hook = devtoolsHook()
    if (hook) {
      hook.registry.owners.set(owner.id, owner)
      hook.emit({ type: 'owner:create', id: owner.id, parent: p ? p.id : null, kind, name: dev?.name, loc: dev?.loc })
    }
  }
  return owner
}

export function getOwner(): Owner | null {
  return currentOwner
}

/** Interno: troca o owner atual e devolve o anterior (o scheduler usa ao rodar efeitos). */
export function setOwner(owner: Owner | null): Owner | null {
  const prev = currentOwner
  currentOwner = owner as OwnerImpl | null
  return prev
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = setOwner(owner)
  try {
    return fn()
  } finally {
    currentOwner = prev as OwnerImpl | null
  }
}

/** Interno: registra um cleanup ou nó reativo para ser descartado com `owner`. */
export function registerDisposable(owner: Owner, item: Disposable): void {
  ;((owner as OwnerImpl).disposables ??= []).push(item)
}

/** Registra cleanup no owner atual. Rodam em ordem reversa no dispose. Fora de owner: ignorado (aviso em dev). */
export function onCleanup(fn: Cleanup): void {
  if (currentOwner) registerDisposable(currentOwner, fn)
  else if (DEV) console.warn('[jotastic] use-outside-owner: onCleanup chamado fora de um owner; nunca vai rodar')
}

/** Descarta recursivamente: filhos (reverso), depois efeitos e cleanups (reverso). Idempotente. */
export function dispose(owner: Owner): void {
  const o = owner as OwnerImpl
  if (o.disposed) return
  o.disposed = true
  if (o.children) {
    const children = [...o.children]
    for (let i = children.length - 1; i >= 0; i--) dispose(children[i]!)
    o.children = null
  }
  const items = o.disposables
  if (items) {
    o.disposables = null
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]!
      try {
        if (typeof item === 'function') item()
        else item.dispose()
      } catch (e) {
        handleError(o, e, 'effect')
      }
    }
  }
  const parent = o.parent as OwnerImpl | null
  if (parent && parent.children) parent.children.delete(o)
  if (DEV) {
    const hook = devtoolsHook()
    if (hook) {
      hook.registry.owners.delete(o.id)
      hook.emit({ type: 'owner:dispose', id: o.id })
    }
  }
}

/** Interno (para `createRoot`): handler `onError` do root. */
export function setOnError(owner: Owner, handler: ((error: unknown, info: ErrorInfo) => void) | null): void {
  ;(owner as OwnerImpl).onError = handler
}

/** Interno (para `@jotastic/test`): com `true`, erro não tratado por fronteira nem por `onError` é relançado. */
export function setRethrowUnhandled(on: boolean): void {
  rethrowUnhandled = on
}

/** Interno: erro do runtime com `code` = ID do diagnóstico (12-diagnosticos.md). */
export function jotasticError(code: string, message: string): Error & { code: string } {
  const e = new Error(`[jotastic] ${code}: ${message}`) as Error & { code: string }
  e.code = code
  return e
}

/**
 * Roteia um erro: fronteira mais próxima que trate (via `catch`) → `onError` do root → `console.error`.
 * Nunca lança, exceto com `setRethrowUnhandled(true)` quando ninguém tratou.
 */
export function handleError(owner: Owner | null, error: unknown, phase: ErrorPhase): void {
  const info: ErrorInfo = { phase, owner: owner as Owner }
  if (DEV) {
    for (let o = owner as OwnerImpl | null; o; o = o.parent as OwnerImpl | null) {
      if (o.name !== undefined) {
        info.component = o.name
        info.loc = o.loc
        break
      }
    }
  }
  for (let b = owner ? owner.boundary : null; b; b = b.owner.parent ? b.owner.parent.boundary : null) {
    if (b.catch(error, info)) {
      if (DEV) reportError(owner, error, phase, 'boundary')
      return
    }
  }

  let root: OwnerImpl | null = null
  for (let o = owner as OwnerImpl | null; o; o = o.parent as OwnerImpl | null) {
    if (o.onError) {
      root = o
      break
    }
  }
  if (root && root.onError) {
    if (DEV) reportError(owner, error, phase, 'root')
    try {
      root.onError(error, info)
    } catch (e) {
      console.error(e)
    }
    return
  }

  if (DEV) reportError(owner, error, phase, 'console')
  if (rethrowUnhandled) throw error
  // `info.loc` só existe em dev.
  if (DEV && info.loc) console.error(error, `(${info.loc})`)
  else console.error(error)
}

/** Dev: evento `error` do devtools com quem tratou. */
function reportError(
  owner: Owner | null,
  error: unknown,
  phase: ErrorPhase,
  handledBy: 'boundary' | 'root' | 'console',
): void {
  const hook = devtoolsHook()
  if (hook) hook.emit({ type: 'error', phase, owner: owner ? owner.id : 0, error, handledBy })
}
