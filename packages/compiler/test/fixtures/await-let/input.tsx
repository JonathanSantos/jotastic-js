// 18 §10.3 (D36): `let x = await` → `x = v` vira `_r0.value.set(v)`; `x.campo = v` passa pelo proxy
import { api } from './api'

export async function Profile({ id }: { id: string }) {
  let user = await api.user(id)
  async function rename(name: string) {
    const previous = user.name
    user.name = name
    try {
      await api.rename(id, name)
    } catch {
      user.name = previous
    }
  }
  return (
    <div>
      <input value={user.name} onChange={(e) => rename(e.currentTarget.value)} />
      <button onClick={() => (user = { id, name: '' })}>limpar</button>
    </div>
  )
}
