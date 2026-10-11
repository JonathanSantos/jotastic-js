# 16 — Router (fase 2, desenho preliminar)

Desenho mínimo para os exemplos serem escritos hoje e para o router oficial nascer coerente com a lib. A API é funcional, as páginas são componentes comuns e os dados da página vêm de `await` no componente.

## Definição de rotas

```ts
// router.ts
import { defineRoutes } from '@jotastic/router'
import { Home } from './pages/Home'
import { UsersLayout, UsersList, UserPage } from './pages/users'
import { NotFound } from './pages/NotFound'

export const routes = defineRoutes({
  '/': Home,
  '/users': {
    component: UsersLayout,                    // layout com <Outlet />
    children: { '/': UsersList, '/:id': UserPage },   // UserPage recebe { id: string } como prop
  },
  '*': NotFound,
})
```

- Parâmetros (`:id`) viram **props tipadas** da página (`UserPage({ id })`). O tipo é inferido do caminho.
- Páginas async (`await`) são cobertas pelo `<Outlet>`, que é um `<Boundary>`: aceita `pending`/`error` e os aplica a cada troca de rota.

## Uso

```tsx
// main.tsx
mount(<App />, '#app', { plugins: [router(routes)] })

// App.tsx
import { Outlet, Link, useRoute } from '@jotastic/router'

export function App() {
  const route = useRoute()      // { path, params, query, navigate, back }
  return (
    <>
      <nav>
        <Link to="/">Início</Link>
        <Link to="/users">Usuários</Link>              {/* ganha class "active" quando ativa */}
        <Link to="/users/:id" params={{ id: '42' }}>Ana</Link>   {/* erro de tipo se a rota não existe */}
      </nav>
      <Outlet pending={<PageSpinner />} />
      <small>{route.path}</small>
    </>
  )
}
```

- `useRoute()` é uma função `use*` comum: `route.params`, `route.query` e `route.path` são reativos.
- `route.navigate('/users/:id', { id })`, `route.navigate(-1)`, `route.back()`.
- `<Link>` renderiza `<a href>` real (acessível, abre em nova aba), intercepta o clique, e adiciona `class="active"` (configurável com `activeClass`).
- Guards: `beforeEnter: (to, from) => boolean | string` por rota.
- Scroll restaurado por padrão; `scroll: false` por rota desliga.
- Lazy: `'/admin': () => import('./pages/Admin')` divide o bundle.

## Fora deste desenho

Rotas por arquivo (`src/pages/users/[id].tsx`) podem gerar o `defineRoutes` acima por plugin Vite. Transições de página dependem de `transition:` ([06](06-controle-de-fluxo.md)).
