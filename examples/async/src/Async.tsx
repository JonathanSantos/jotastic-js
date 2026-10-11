import { pending, refresh, Boundary } from 'jotastic'
import { api } from './api' // [ajuste] A-11: stub com latência simulada no lugar de `./lib/api` + `declare const api`
import { useDebounced } from './useDebounced' // [ajuste] era `declare function useDebounced` (07-use-functions)
import { ErrorBox, ErrorPage, PageSpinner, Skeleton } from './ui' // [ajuste] eram `declare const`

// 1) O caso básico: await no componente. Sem useEffect, loading, error, flag de cancelamento ou signal.
export async function UserCard({ id }: { id: string }) {
  const user = await api.user(id) // id muda → refaz, aborta a anterior, ignora resposta atrasada
  return (
    <article class={{ dimmed: pending(user) /* true enquanto recarrega; conteúdo antigo fica */ }}>
      <h2>{user.name}</h2>
      <button onClick={() => refresh(user)}>Atualizar</button>
    </article>
  )
}

// Loading e erro ficam no <Boundary>, explícitos, como <Suspense> + ErrorBoundary em uma peça
export function Sidebar({ userId }: { userId: string }) {
  // [ajuste] `e as Error`: o erro do Boundary é `unknown`
  return (
    <Boundary pending={<Skeleton />} error={(e, retry) => <ErrorBox error={e as Error} onRetry={retry} />}>
      <UserCard id={userId} />
    </Boundary>
  )
}

// Um boundary espera vários filhos no primeiro carregamento
export function Dashboard({ userId }: { userId: string }) {
  // [ajuste] `e as Error`: o erro do Boundary é `unknown`
  return (
    <Boundary pending={<PageSpinner />} error={(e, retry) => <ErrorPage error={e as Error} onRetry={retry} />}>
      <UserCard id={userId} />
      <UserPosts id={userId} />
    </Boundary>
  )
}

// 2) Awaits dependentes e paralelos
export async function UserPosts({ id }: { id: string }) {
  const user = await api.user(id)
  const [posts, tags] = await Promise.all([api.posts(user.id), api.tags()]) // paralelo explícito
  let onlyPublished = false // estado da continuação

  const visible = onlyPublished ? posts.filter((p) => p.published) : posts

  return (
    <section>
      <label>
        <input type="checkbox" checked={onlyPublished} />
        Só publicados
      </label>
      <ul>
        {visible.map((p) => (
          <li>
            {p.title} {tags[p.tagId]}
          </li>
        ))}
      </ul>
    </section>
  )
}

// 3) Busca com estado antes do await (sobrevive a recargas) + debounce
export async function Search() {
  let query = ''
  const debounced = useDebounced(query, 300)
  const results = await api.search(debounced.value)

  return (
    <>
      <input value={query} placeholder="Buscar" />
      <ul class={{ dimmed: pending(results) }}>
        {results.map((r) => (
          <li>{r.title}</li>
        ))}
      </ul>
    </>
  )
}

// 4) Optimistic update: `let` + await permite sobrescrever localmente
export async function Profile({ id }: { id: string }) {
  let user = await api.user(id)

  async function rename(name: string) {
    const previous = user.name
    user.name = name // UI atualiza na hora
    try {
      await api.rename(id, name)
    } catch {
      user.name = previous
    } // desfaz
  }

  return <input value={user.name} onChange={(e) => rename(e.currentTarget.value)} />
}
