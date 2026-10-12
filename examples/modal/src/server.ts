// [ajuste] Backend simulado: `DELETE /api/me` sempre falha (erro de rede, como o `fetch` real), para o <Boundary>
// mostrar o erro do handler async. O resto passa para o `fetch` original.
const realFetch = globalThis.fetch

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.replace(/^https?:\/\/[^/]+/, '') !== '/api/me' || init?.method !== 'DELETE') return realFetch(input, init)
  return new Promise<Response>((_, reject) => setTimeout(() => reject(new TypeError('Servidor indisponível')), 50))
}) as typeof fetch
