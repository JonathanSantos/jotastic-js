// Demo de docs/spec/examples/06-async.tsx: troca de usuário (aborta a requisição anterior), refresh, erro → retry,
// busca com debounce e rename otimista. O backend é simulado em `./server` (latência + modo de erro).
import { Boundary } from 'jotastic'
import { Dashboard, Profile, Search, Sidebar } from './Async'
import { server } from './server'
import { ErrorBox, Skeleton } from './ui'

export function App() {
  let userId = '1'
  let fail = server.fail

  function setFail(v: boolean) {
    fail = v
    server.fail = v
  }

  return (
    <main>
      <h1>Jotastic · async</h1>
      <nav>
        {['1', '2', '3'].map((id) => (
          <button class={{ active: userId === id }} onClick={() => (userId = id)}>
            Usuário {id}
          </button>
        ))}
        <label>
          <input type="checkbox" checked={fail} onChange={(e) => setFail(e.currentTarget.checked)} />
          Simular falha da API
        </label>
      </nav>

      <h3>Sidebar</h3>
      <div class="sidebar">
        <Sidebar userId={userId} />
      </div>

      <h3>Dashboard</h3>
      <div class="dashboard">
        <Dashboard userId={userId} />
      </div>

      <h3>Busca</h3>
      <div class="search">
        <Boundary pending={<Skeleton />} error={(e, retry) => <ErrorBox error={e as Error} onRetry={retry} />}>
          <Search />
        </Boundary>
      </div>

      <h3>Perfil (rename otimista)</h3>
      <div class="profile">
        <Boundary pending={<Skeleton />} error={(e, retry) => <ErrorBox error={e as Error} onRetry={retry} />}>
          <Profile id={userId} />
        </Boundary>
      </div>
    </main>
  )
}
