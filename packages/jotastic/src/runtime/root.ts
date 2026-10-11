// Root: owner raiz + inserção no alvo + flush síncrono (ver docs/spec/contracts/runtime.d.ts §Root).

import { insertSlot, type Slot } from './dom'
import {
  createOwner,
  dispose,
  handleError,
  runWithOwner,
  setOnError,
  type DevMeta,
  type Dispose,
  type ErrorInfo,
} from './owner'
import { flush, untrack } from './reactive'

export interface RootOptions {
  onError?: (error: unknown, info: ErrorInfo) => void
  dev?: DevMeta
}

/**
 * Cria um owner raiz, roda `render()` dentro dele (sem rastrear), insere o resultado em `target`
 * via `insert(target, …, null)`, chama `flush()` síncrono e devolve `unmount` (dispose + remove os nós inseridos).
 */
export function createRoot(target: Element, render: () => unknown, opts?: RootOptions): Dispose {
  const owner = createOwner('root', null, opts?.dev)
  if (opts?.onError) setOnError(owner, opts.onError)
  let slot: Slot | null = null
  runWithOwner(owner, () => {
    let result: unknown
    try {
      result = untrack(render)
    } catch (e) {
      handleError(owner, e, 'setup')
      return
    }
    slot = insertSlot(target, result, null)
  })
  flush()
  return () => {
    dispose(owner)
    if (slot) (slot as Slot).clear()
    slot = null
  }
}
