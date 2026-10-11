// 18 §10.1–§10.4, §10.6: `const x = await` → resource + continuation; `pending`/`refresh` reescritos; sem `async`
import { pending, refresh } from 'jotastic'
import { api } from './api'

export async function UserCard({ id }: { id: string }) {
  const user = await api.user(id)
  return (
    <article class={{ dimmed: pending(user) }}>
      <h2>{user.name}</h2>
      <button onClick={() => refresh(user)}>Atualizar</button>
    </article>
  )
}
