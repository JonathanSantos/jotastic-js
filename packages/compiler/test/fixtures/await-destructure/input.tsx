// 18 §10.4–§10.5: `await` sem declarador (só espera) e `const [a, b] = await Promise.all(…)` → um recurso
import { api } from './api'

export async function Dash() {
  await api.ready()
  const [user, { tags = [] }] = await Promise.all([api.user(), api.meta()])
  return (
    <p>
      {user.name}: {tags.length}
    </p>
  )
}
