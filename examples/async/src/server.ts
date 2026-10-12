// [ajuste] Backend simulado: troca `globalThis.fetch` por um handler de `/api/*` com latência e modo de erro.
// O `examples/lib/api.ts` usa `jotastic/fetch` de verdade (anexa o abortSignal do recurso), então o cancelamento é real:
// uma requisição abortada rejeita com `AbortError` e nunca responde.

import type { Post, User } from '../../lib/api'

const users: Record<string, User> = {
  '1': { id: '1', name: 'Ana' },
  '2': { id: '2', name: 'Bia' },
  '3': { id: '3', name: 'Caio' },
}
const posts: Record<string, Post[]> = {
  '1': [
    { id: 'p1', title: 'Signals sem hooks', published: true, tagId: 1 },
    { id: 'p2', title: 'Rascunho: compilador', published: false, tagId: 2 },
  ],
  '2': [{ id: 'p3', title: 'Boundary na prática', published: true, tagId: 1 }],
  '3': [],
}
const tags: Record<number, string> = { 1: '#runtime', 2: '#compilador' }

export interface PendingRequest {
  url: string
  method: string
  signal: AbortSignal | null | undefined
  /** responde já (ignora a latência) */
  respond(): void
  done: boolean
}

export const server = {
  /** ms até responder; `Infinity` = só com `respond()`/`respondAll()` (testes) */
  latency: 600,
  /** modo de erro: toda requisição falha (erro de rede) */
  fail: false,
  requests: [] as PendingRequest[],
  respondAll() {
    for (const r of server.requests) if (!r.done) r.respond()
  },
  reset() {
    server.latency = 600
    server.fail = false
    server.requests.length = 0
    users['1']!.name = 'Ana'
    users['2']!.name = 'Bia'
    users['3']!.name = 'Caio'
  },
}

// Erros HTTP levam a mensagem em `statusText`: é o que `examples/lib/api.ts` usa no `Error`.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status >= 400 ? (body as { message: string }).message : '',
    headers: { 'content-type': 'application/json' },
  })

function route(method: string, path: string, body: string | undefined): Response {
  let m: RegExpMatchArray | null
  if ((m = path.match(/^\/api\/users\/(\w+)$/))) {
    const user = users[m[1]!]
    if (!user) return json(404, { message: 'Usuário não encontrado' })
    if (method === 'PATCH') Object.assign(user, JSON.parse(body ?? '{}'))
    return json(200, { ...user })
  }
  if ((m = path.match(/^\/api\/users\/(\w+)\/posts$/))) return json(200, posts[m[1]!] ?? [])
  if (path === '/api/tags') return json(200, tags)
  if ((m = path.match(/^\/api\/search\?q=(.*)$/))) {
    const q = decodeURIComponent(m[1]!).toLowerCase()
    const all = Object.values(posts).flat()
    return json(200, q ? all.filter((p) => p.title.toLowerCase().includes(q)) : all)
  }
  return json(404, { message: `Rota desconhecida: ${path}` })
}

const realFetch = globalThis.fetch

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, '')
  if (!path.startsWith('/api/')) return realFetch(input, init)
  const signal = init?.signal
  const method = init?.method ?? 'GET'
  return new Promise<Response>((resolve, reject) => {
    const abortError = () => new DOMException('A requisição foi abortada', 'AbortError')
    if (signal?.aborted) return reject(abortError())
    let timer: ReturnType<typeof setTimeout> | undefined
    const req: PendingRequest = {
      url: path,
      method,
      signal,
      done: false,
      respond() {
        if (req.done) return
        req.done = true
        clearTimeout(timer)
        // Modo de erro = falha de rede (como o `fetch` real: rejeita com TypeError). Assim até `rename`, que em
        // `lib/api.ts` ignora o status da resposta, falha.
        if (server.fail) reject(new TypeError('Servidor indisponível'))
        else resolve(route(method, path, typeof init?.body === 'string' ? init.body : undefined))
      },
    }
    signal?.addEventListener('abort', () => {
      if (req.done) return
      req.done = true
      clearTimeout(timer)
      reject(abortError())
    })
    server.requests.push(req)
    if (Number.isFinite(server.latency)) timer = setTimeout(req.respond, server.latency)
  })
}

globalThis.fetch = fakeFetch as typeof fetch
