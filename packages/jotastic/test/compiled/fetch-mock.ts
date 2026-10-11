// Utilitário de teste: `fetch` global controlável (cada chamada fica pendente até `resolve`/`reject`).
import { vi } from 'vitest'

export interface PendingRequest {
  url: string
  signal: AbortSignal
  resolve(body: unknown, init?: { ok?: boolean; statusText?: string }): Promise<void>
}

export function mockFetch(): { requests: PendingRequest[]; restore(): void } {
  const requests: PendingRequest[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init!.signal!
      return new Promise((res, rej) => {
        signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')), { once: true })
        requests.push({
          url: String(input),
          signal,
          async resolve(body, opts) {
            res({
              ok: opts?.ok ?? true,
              statusText: opts?.statusText ?? 'OK',
              json: () => Promise.resolve(body),
            })
            // deixa as cadeias `.then` do useFetch e o flush (microtask) terminarem
            for (let i = 0; i < 5; i++) await Promise.resolve()
          },
        })
      })
    }),
  )
  return { requests, restore: () => vi.unstubAllGlobals() }
}
