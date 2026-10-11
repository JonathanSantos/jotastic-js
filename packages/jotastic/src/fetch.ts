// `jotastic/fetch`: drop-in de `fetch` que anexa o signal ambiente (`abortSignal()`): o do recurso em execução,
// o do efeito em execução, ou um que nunca aborta. Se já há signal (em `init` ou no `Request`), combina os dois.

import { abortSignal } from './runtime/reactive'

/** `AbortSignal.any` com fallback (aborta assim que o primeiro abortar, com o mesmo `reason`). */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const any = (AbortSignal as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (typeof any === 'function') return any.call(AbortSignal, signals)
  const ctrl = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason)
      break
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true, signal: ctrl.signal })
  }
  return ctrl.signal
}

export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ambient = abortSignal()
  const own = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
  const signal = own && own !== ambient ? anySignal([own, ambient]) : ambient
  return globalThis.fetch(input, { ...init, signal })
}
