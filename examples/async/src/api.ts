// [ajuste] A-11: o `lib/api.ts` do comentário de docs/spec/examples/06-async.tsx, com `jotastic/fetch` (anexa o
// signal do recurso atual) falando com o backend simulado de `./server`.
import { fetch } from 'jotastic/fetch'
import './server'
import type { Post, User } from './server'

async function get<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const body = await r.json()
  if (!r.ok) throw new Error((body as { message?: string }).message ?? `HTTP ${r.status}`)
  return body as T
}

export const api = {
  user: (id: string) => get<User>(`/api/users/${id}`),
  posts: (id: string) => get<Post[]>(`/api/users/${id}/posts`),
  tags: () => get<Record<number, string>>('/api/tags'),
  search: (q: string) => get<{ id: string; title: string }[]>(`/api/search?q=${encodeURIComponent(q)}`),
  rename: (id: string, name: string) =>
    get<User>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }).then(() => undefined),
}
