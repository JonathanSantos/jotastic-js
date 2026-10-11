# 07 — Async: `await` no componente

Acaba com `useEffect` + `useState(loading)` + `useState(error)` + flag de cancelamento. O dev escreve `await`; o compilador gera o recurso.

```tsx
async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)
  return <h1>{user.name}</h1>
}

<Boundary pending={<Spinner />} error={(e, retry) => <ErrorBox error={e} onRetry={retry} />}>
  <UserPage id={id} />
</Boundary>
```

## Semântica

### Cada `await` no corpo raiz vira um recurso

- O compilador rastreia o que a expressão do `await` lê (`id`). Quando muda, a requisição é refeita.
- A anterior é **cancelada** e respostas atrasadas são **ignoradas**: sem race condition.
- O código depois do `await` é a **continuação** (mesmo mecanismo do early return): roda quando o valor chega, em um owner próprio.
- `user.name` no JSX é um binding no valor do recurso: um refresh que traz um nome novo atualiza **só** aquele texto.
- Só os `await` do **corpo raiz** viram recursos. Em handlers e funções, `await` é JS normal.

### Loading e erro: `<Boundary>`

Um único componente de fronteira, explícito, sem props injetadas no componente async:

```tsx
<Boundary pending={<PageSpinner />} error={(e, retry) => <ErrorPage error={e} onRetry={retry} />}>
  <UserPage id={id} />
  <UserPosts id={id} />          // o boundary espera os dois no primeiro carregamento
</Boundary>
```

- `pending`: mostrado enquanto qualquer descendente async (até o próximo `<Boundary>`) está no **primeiro** carregamento.
- `error`: recebe erros síncronos, de `await`, de handlers e de efeitos ([09](09-erros.md)). `retry` recria a subárvore.
- Sem `pending`, os filhos aparecem quando estiverem prontos. Sem `error`, o erro sobe para o próximo `<Boundary>` ou para o `onError` do `mount`.
- Para um "skeleton padrão" de um componente, embrulhe-o: `const UserPageWithSkeleton = (p) => <Boundary pending={<Skeleton />}><UserPage {...p} /></Boundary>`.

### Recarga mantém o conteúdo antigo

Quando `id` muda **depois** do primeiro carregamento, a UI atual continua visível (stale-while-revalidate); o `pending` do boundary **não** volta. Para indicar:

```tsx
import { pending, refresh } from 'jotastic'

<div class={{ dimmed: pending(user) }}>
  <h1>{user.name}</h1>
  <button onClick={() => refresh(user)}>Atualizar</button>
</div>
```

`pending(user)` e `refresh(user)` funcionam porque o compilador sabe que `user` veio de um `await`. Para voltar ao `pending` a cada mudança: `<UserPage key={id} />`.

**Consistência:** quando `id` muda, o resto da UI que lê `id` atualiza na hora; `user` fica com o valor antigo até o novo chegar. Sem coordenação entre os dois no MVP (transições ficam para a fase 2).

### Cancelamento real: `abortSignal()` é ambiente

Respostas antigas sempre são ignoradas. Para abortar a requisição de rede, o signal do recurso atual está disponível para **qualquer função chamada sincronamente a partir da expressão do `await`**. O lugar certo é a camada de API, uma vez só:

```ts
// lib/api.ts
import { abortSignal } from 'jotastic'
export const getUser = (id: string) =>
  fetch(`/api/users/${id}`, { signal: abortSignal() }).then(r => r.json())

// ou, sem escrever signal nunca mais:
import { fetch } from 'jotastic/fetch'        // drop-in que anexa o signal do recurso atual
export const getUser = (id: string) => fetch(`/api/users/${id}`).then(r => r.json())
```

- Dentro de um `watch`, `abortSignal()` devolve um signal abortado no cleanup do efeito ([04](04-efeitos-e-ciclo-de-vida.md#watch)).
- Fora de recurso e de efeito, devolve um signal que nunca aborta; o código da API funciona em qualquer lugar.
- Depois de um `await` **dentro** da função de API, o contexto ambiente se perde; capture antes (`const signal = abortSignal()`).
- Dica em dev `fetch-without-signal`: um `fetch(` literal na expressão de um `await` de componente sem `signal`.

### Múltiplos `await`

```tsx
const user = await api.getUser(id)
const posts = await api.getPosts(user.id)      // depende de `user`: refaz quando `user` muda
const ads = await api.getAds()                 // não depende, mas roda em sequência (JS normal)
const [a, b] = await Promise.all([api.a(), api.b()])   // paralelo explícito
```

Semântica sequencial do JavaScript, sem surpresa. Dois `await` seguidos sem dependência léxica recebem a dica `await-waterfall` sugerindo `Promise.all`.

### Estado antes e depois do `await`

```tsx
async function SearchPage() {
  let query = ''                                  // setup: sobrevive a recargas
  const results = await api.search(useDebounced(query, 300).value)
  let selected: Result | null = null              // continuação: reseta só se voltar a `pending`
  …
}
```

Como recargas mantêm o conteúdo, a continuação **não** é recriada ao refazer o recurso.

### `let` + `await`: sobrescrita local

```tsx
let user = await api.getUser(id)
async function rename(name: string) {
  user.name = name                 // optimistic: muta o objeto reativo na hora
  await api.rename(id, name)       // o próximo refresh traz o valor do servidor
}
```

### Erros

- Erro no `await` vai para o `error` do `<Boundary>` mais próximo, com `retry`.
- `try/catch` em volta de um `await` de componente: **fase 2** (`await-in-try` no MVP sugere `<Boundary>`). O recurso já nasce com o estado de erro roteável.

## Saída compilada (aproximada)

```js
export function UserPage(props) {
  const _r0 = resource((signal) => api.getUser(props.id))   // rastreia props.id; `signal` fica ambiente durante a chamada
  return continuation(_r0, () => {
    const _el = _t0()
    insert(_el.firstChild, () => _r0.value.get().name, null)
    return _el
  })
}
```

## Cache e deduplicação (fase 2)

```ts
export const getUser = cached((id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
  { key: id => ['user', id], staleTime: 30_000 })
```

Dois componentes com `await getUser(5)` disparam uma requisição; `invalidate(['user', 5])` refaz em todos. Cobre ~80% do React Query. O `resource` do MVP já aceita um `cached` por fora.
