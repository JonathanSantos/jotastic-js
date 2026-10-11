// [ajuste] Stubs de teste para 05-async-user-card.js: substituem `./lib/api` e `./components` (não existem na spec).
// `api.user(id)` lê o signal ambiente com `abortSignal()` (como a camada de API de 07-async.md) e devolve uma Promise
// controlada pelo teste via `requests`. `pending`/`refresh` públicos não são necessários: o compilador os reescreve
// para `_r0.pending.get()` / `_r0.refresh()`.
import { abortSignal, insert, listen, template } from 'jotastic/runtime'

export interface User {
  id: string
  name: string
}

export interface PendingRequest {
  id: string
  signal: AbortSignal
  resolve: (u: User) => void
  reject: (e: unknown) => void
}

export const requests: PendingRequest[] = []

export const api = {
  user(id: string): Promise<User> {
    const signal = abortSignal()
    return new Promise<User>((resolve, reject) => {
      requests.push({ id, signal, resolve, reject })
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    })
  },
}

const _t0 = template('<div class="skeleton"></div>')
const _t1 = template('<p class="error"><span></span><button>Tentar de novo</button></p>')

export function Skeleton(): Node {
  return _t0()
}

export function ErrorBox(props: { error: unknown; onRetry: () => void }): Node {
  const _el = _t1()
  const _span = _el.firstChild!
  insert(_span, () => String((props.error as Error)?.message ?? props.error), null)
  listen(_el.lastChild!, 'click', () => props.onRetry())
  return _el
}
