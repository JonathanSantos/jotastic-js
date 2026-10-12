// O mesmo componente nas duas bibliotecas. Tudo o que some na versão Jotastic é feito pelo compilador.

// ───────────────────────────── React ─────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'

export function UserSearchReact({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [selected, setSelected] = useState<User | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    const ctrl = new AbortController()
    setLoading(true)
    const id = setTimeout(() => {
      fetch(`/api/users?q=${query}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(data => { if (!cancelled) { setUsers(data); setError(null) } })
        .catch(e => { if (!cancelled && e.name !== 'AbortError') setError(e) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; ctrl.abort(); clearTimeout(id) }
  }, [query])

  useEffect(() => { inputRef.current?.focus() }, [])

  const sorted = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users])
  const select = useCallback((u: User) => setSelected(u), [])

  if (error) return <p className="error">{error.message}</p>

  return (
    <div>
      <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} />
      {loading && <span>…</span>}
      <ul>
        {sorted.map(u => (
          <li key={u.id} className={selected?.id === u.id ? 'selected' : ''} onClick={() => select(u)}>
            {u.name}
          </li>
        ))}
      </ul>
      {selected && <UserDetailReact user={selected} />}
    </div>
  )
}

// ──────────────────────────── Jotastic ───────────────────────────
import { pending } from 'jotastic'
import { useDebounced } from './07-use-functions'
import { api } from './lib/api'          // api.ts usa `fetch` de 'jotastic/fetch': cancelamento sem signal no componente

export async function UserSearch({ initialQuery }: { initialQuery: string }) {
  let query = initialQuery
  let selected: User | null = null

  const q = useDebounced(query, 300)
  const users = await api.users(q.value)                        // refaz quando `q.value` muda, cancela a anterior
  const sorted = [...users].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div>
      <input value={query} autofocus />
      {pending(users) && <span>…</span>}
      <ul>
        {sorted.map(u => (
          <li class={{ selected: selected?.id === u.id }} onClick={() => (selected = u)}>
            {u.name}
          </li>
        ))}
      </ul>
      {selected && <UserDetail user={selected} />}
    </div>
  )
}
// uso: <Boundary error={e => <p class="error">{e.message}</p>}><UserSearch initialQuery="" /></Boundary>

// Sumiram: 5 useState, 2 useEffect (com cleanup e flag de cancelamento), useMemo, useCallback, useRef,
// array de dependências, className, o `[...]` de deps vazio para focar, o AbortController, o onChange do input, a key.
// Ganhou: cancelamento real, sem race condition, lista que atualiza só o <li> clicado.

interface User { id: string; name: string }
declare const UserDetailReact: (p: { user: User }) => JSX.Element
declare const UserDetail: (p: { user: User }) => JSX.Element
