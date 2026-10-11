// Router: fase 2 (desenho em docs/spec/16-router.md). Mostra como páginas, dados e navegação se encaixam.
import { mount, pending } from 'jotastic'
import { defineRoutes, router, Outlet, Link, useRoute } from '@jotastic/router'

// ---------- páginas ----------
function Home() {
  return <h1>Bem-vindo</h1>
}

function UsersLayout() {
  const route = useRoute()
  let search = route.query.q ?? ''            // cópia inicial da query

  return (
    <div class="users">
      <aside>
        <input value={search} placeholder="Buscar" />
        <UsersList q={search} />
      </aside>
      <main>
        <Outlet pending={<p>Carregando…</p>} />     {/* UsersIndex ou UserPage; Outlet é um <Boundary> */}
      </main>
    </div>
  )
}

async function UsersList({ q }: { q: string }) {
  const users = await api.users({ q })        // refaz quando `q` muda; cancela a anterior
  return (
    <ul class={{ dimmed: pending(users) }}>
      {users.map(u => (
        <li>
          <Link to="/users/:id" params={{ id: u.id }}>{u.name}</Link>   {/* class="active" na rota atual */}
        </li>
      ))}
    </ul>
  )
}

function UsersIndex() {
  return <p>Selecione um usuário.</p>
}

async function UserPage({ id }: { id: string }) {       // `id` vem do segmento :id, tipado
  const route = useRoute()
  const user = await api.user(id)                      // troca de usuário sem perder o layout

  return (
    <article>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <button onClick={() => route.navigate('/users')}>Voltar</button>
    </article>
  )
}

function NotFound() {
  return <h1>404</h1>
}

// ---------- rotas ----------
const routes = defineRoutes({
  '/': Home,
  '/users': {
    component: UsersLayout,
    children: {
      '/': UsersIndex,
      '/:id': UserPage,
    },
  },
  '/admin': () => import('./pages/Admin'),   // lazy: divide o bundle
  '*': NotFound,
})

// ---------- app ----------
function App() {
  const route = useRoute()
  return (
    <>
      <nav>
        <Link to="/">Início</Link>
        <Link to="/users">Usuários</Link>
      </nav>
      <Outlet error={(e, retry) => <p>Falhou: {e.message} <button onClick={retry}>Tentar de novo</button></p>} />
      <footer>{route.path}</footer>
    </>
  )
}

mount(<App />, '#app', { plugins: [router(routes)] })

declare const api: {
  users(p: { q: string }): Promise<{ id: string; name: string }[]>
  user(id: string): Promise<{ id: string; name: string; email: string }>
}
