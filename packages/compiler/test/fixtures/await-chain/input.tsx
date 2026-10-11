// 18 §10.2, §10.9: early return antes e depois de `await`, `await` encadeado (continuações aninhadas), estado do
// setup (antes do `await`) e da continuação
import { api } from './api'
import { Spinner } from './spinner'

export async function Page({ id, skip }: { id: string; skip: boolean }) {
  let query = ''
  if (skip) return <Spinner />
  const user = await api.user(id, query)
  if (!user.active) return <p class="off">{user.name}</p>
  let open = false
  const posts = await api.posts(user.id)
  return (
    <section>
      <input value={query} />
      <h1 onClick={() => (open = !open)}>{user.name}</h1>
      {open && <ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>}
    </section>
  )
}
