// A camada de API é o único lugar que fala de cancelamento.
import { fetch } from 'jotastic/fetch'      // drop-in: anexa o abortSignal() do recurso/efeito atual, se houver

export interface User { id: string; name: string; email?: string }
export interface Post { id: string; title: string; published: boolean; tagId: number }

const json = <T>(r: Response) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(r.statusText)))

export const api = {
  user: (id: string) => fetch(`/api/users/${id}`).then(json<User>),
  users: (q: string) => fetch(`/api/users?q=${encodeURIComponent(q)}`).then(json<User[]>),
  posts: (id: string) => fetch(`/api/users/${id}/posts`).then(json<Post[]>),
  tags: () => fetch('/api/tags').then(json<Record<number, string>>),
  search: (q: string) => fetch(`/api/search?q=${encodeURIComponent(q)}`).then(json<{ id: string; title: string }[]>),
  rename: (id: string, name: string) => fetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }).then(() => undefined),
  signup: (input: unknown) => fetch('/api/signup', { method: 'POST', body: JSON.stringify(input) }).then(json<{ id: string }>),
  deleteAccount: () => fetch('/api/me', { method: 'DELETE' }).then(() => undefined),
  validateCoupon: (code: string) => fetch(`/api/coupons/${code}`).then(r => r.ok),
}
