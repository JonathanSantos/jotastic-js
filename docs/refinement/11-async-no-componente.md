# 11 — `await` direto no componente

Objetivo: acabar com o padrão `useEffect` + `useState(loading)` + `useState(error)` + flag de cancelamento. O dev escreve `await` e o compilador cuida do resto.

## Antes e depois

```tsx
// React
function UserPage({ id }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchUser(id)
      .then(u => !cancelled && setUser(u))
      .catch(e => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [id])

  if (loading) return <Spinner />
  if (error) return <ErrorBox error={error} />
  return <h1>{user.name}</h1>
}
```

```tsx
// Jotastic
async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)
  return <h1>{user.name}</h1>
}

<UserPage id={id} pending={<Spinner />} error={e => <ErrorBox error={e} />} />
```

---

## Semântica

### 1. Cada `await` no topo do componente vira um recurso reativo

- O compilador rastreia o que a expressão do `await` lê (`id`).
- Quando `id` muda, a requisição é refeita automaticamente.
- A requisição anterior é **cancelada** e respostas atrasadas são **ignoradas** (sem race condition).
- O código **depois** do `await` é a continuação: roda quando o valor chega, no mesmo modelo do early return reativo ([09](09-condicionais.md)).

### 2. Onde fica o loading e o erro

Três níveis, do mais local ao mais global:

```tsx
// a) Props injetadas em qualquer componente async (tipadas automaticamente)
<UserPage id={id} pending={<Spinner />} error={e => <ErrorBox error={e} />} />

// b) Padrão definido no próprio componente
UserPage.pending = () => <UserSkeleton />
UserPage.error = (e: Error, retry: () => void) => <ErrorBox error={e} onRetry={retry} />

// c) Boundary que cobre uma subárvore
<Async pending={<PageSpinner />} error={(e, retry) => <ErrorPage error={e} onRetry={retry} />}>
  <UserPage id={id} />
  <UserPosts id={id} />
</Async>
```

Prioridade: (a) > (b) > (c) mais próximo. Sem nenhum deles, o componente renderiza vazio enquanto carrega e o erro sobe até o `<Catch>`/`onError` global.

> A tipagem usa `JSX.LibraryManagedAttributes`: se o componente retorna `Promise<JSX.Element>`, as props `pending` e `error` aparecem no autocomplete.

### 3. Recarregamento: conteúdo antigo fica na tela

Quando `id` muda **depois** do primeiro carregamento, a UI atual **continua visível** (stale-while-revalidate) em vez de voltar para o spinner. Para mostrar um indicador:

```tsx
import { pending, refresh } from 'jotastic'

async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)

  return (
    <div class={{ dimmed: pending(user) }}>     {/* true enquanto recarrega */}
      <h1>{user.name}</h1>
      <button onClick={() => refresh(user)}>Atualizar</button>
    </div>
  )
}
```

`pending(user)` e `refresh(user)` funcionam porque o compilador sabe que `user` veio de um `await` e os reescreve para o recurso interno (`_r0.pending.get()`, `_r0.refresh()`).

Para forçar a volta ao `pending` a cada mudança: `<UserPage key={id} ... />`.

### 4. Cancelamento real (AbortSignal)

Respostas antigas sempre são ignoradas. Para **abortar a requisição de rede**, use o signal do recurso atual:

```tsx
import { abortSignal } from 'jotastic'

const user = await fetch(`/api/users/${id}`, { signal: abortSignal() }).then(r => r.json())
```

`abortSignal()` só é válido dentro da expressão de um `await` de componente (o compilador valida).

### 5. Múltiplos `await`

```tsx
async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)
  const posts = await api.getPosts(user.id)      // depende de `user`: sequencial
  const ads = await api.getAds()                 // não depende de nada acima

  return ...
}
```

- `posts` depende de `user`, então roda depois dele, e refaz quando `user` muda.
- `ads` **não depende** de nenhum `await` anterior, mas **roda em sequência** mesmo assim: é a semântica normal do JavaScript, sem surpresas.
- Para paralelizar, o dev usa `Promise.all` explicitamente:

```tsx
const [user, ads] = await Promise.all([api.getUser(id), api.getAds()])
```

> **D11 (adiada):** a paralelização automática de `await` independentes ficou **fora** por enquanto. Ela tem muitos casos de borda: dependências implícitas (ex.: `await login()` seguido de `await getMe()`), mudança na ordem de efeitos colaterais e um comportamento difícil de depurar. Podemos revisitar depois, talvez como um **aviso** do compilador ("estes `await` poderiam rodar em paralelo") em vez de uma transformação automática.

### 6. Estado local antes e depois do `await`

```tsx
async function SearchPage() {
  let query = ''                                    // antes do await: estado do setup, sobrevive a recargas
  const results = await api.search(query)           // refaz quando `query` muda
  let selected: Result | null = null                // depois do await: estado da continuação

  return (
    <>
      <input bind:value={query} />
      <ResultList items={results} onSelect={r => (selected = r)} />
    </>
  )
}
```

Como recargas mantêm o conteúdo antigo (item 3), a continuação **não** é recriada ao refazer o recurso. `selected` só reseta se o componente voltar ao estado `pending` (primeiro carregamento ou `key` diferente).

> Para busca, combine com debounce: `await api.search(debounced(query, 300))`. `debounced` é um derivado atrasado do runtime.

### 7. Erros e retry

- Erro no `await` mostra o `error` (nível a/b/c) com uma função `retry`.
- `try/catch` em volta de um `await` de componente: **não suportado no MVP** (o compilador emite um erro sugerindo a prop `error`).

### 8. `await` fora do topo do componente é JS normal

```tsx
async function save() {
  saving = true
  await api.save(form)           // handler comum, sem transformação
  saving = false
}
```

Só os `await` no **corpo raiz** do componente viram recursos.

---

## Saída compilada (aproximada)

```js
export function UserPage(props) {
  const _r0 = resource(
    (abort) => api.getUser(props.id),            // rastreia props.id
  )
  return asyncBoundary(props, UserPage, _r0, () => {
    // continuação: só roda quando _r0 tem valor
    const _el = _t0()
    text(_el.firstChild, () => _r0.value.get().name)
    return _el
  })
}
```

Note que `user.name` vira `_r0.value.get().name`, então quando um refresh traz um novo `user`, **só** o texto do nome atualiza.

---

## Cache e deduplicação (integração com o devtools)

Por padrão cada recurso é **por instância** (sem cache global). Para compartilhar entre componentes, um wrapper leve:

```ts
// lib/api.ts
import { cached } from 'jotastic'

export const getUser = cached(
  (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
  { key: id => ['user', id], staleTime: 30_000 },
)
```

- Dois componentes com `await getUser(5)` disparam **uma** requisição.
- `invalidate(['user', 5])` refaz em todos os lugares.
- Cada chave aparece no painel **Async** do devtools (ver [12-devtools](12-devtools.md)).

Isso cobre ~80% do que se usa do React Query, nativamente. Mutations, paginação infinita e optimistic updates ficam para depois.

---

## Pontos em aberto

- **D12:** `cached` entra no MVP ou fica para depois? (recomendado: depois, mas o design do `resource` já deve aceitá-lo)
- SSR: no futuro os `await` podem ser resolvidos no servidor e serializados (streaming). O design atual não bloqueia isso.
