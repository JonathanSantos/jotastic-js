# 06 — Controle de fluxo

## Branch = owner

Cada lado de uma condicional é um **branch**, com seu próprio **owner**: o escopo que é dono dos nós, bindings, `watch`, `onCleanup`, `external` e componentes filhos criados ali.

```
{open ? <Panel /> : <Collapsed />}

      cond = memo(() => !!open)      ← guard: só muda quando inverte
          │
   ┌──────┴───────┐
 branch true    branch false
 owner + nós    owner + nós
```

| Evento | O que acontece |
|---|---|
| **Ativar** | Clona o template, cria os bindings, roda o setup dos componentes, insere os nós entre as âncoras, roda `onMount` |
| **Desativar** | `owner.dispose()`: cleanups em ordem reversa, bindings desligados dos signals, nós removidos |
| **Reativar** | Nova instância (estado novo) |

Invariante: **atualizações rodam de cima para baixo**. O pai decide antes do filho; um branch interno nunca roda a partir de um pai que está sendo descartado. Isso é o que torna o narrowing do TS verdadeiro em runtime.

## Condicionais no JSX

```tsx
{showHelp && <p class="help">{helpText}</p>}           // liga/desliga
{loggedIn ? <Dashboard /> : <Login />}                 // alterna (descarta um, cria o outro)
{user ? <Profile user={user} /> : <Login />}           // `user` muda de objeto: !!user continua true → não recria
{status === 'loading' ? <Spinner /> : status === 'error' ? <Error /> : <List />}   // switch
{{ loading: <Spinner />, error: <Error />, ok: <List /> }[status]}                  // switch por objeto (lazy)
<button class={loading ? 'btn loading' : 'btn'} disabled={loading} />              // atributo: não é branch
```

- Mudanças dentro de um branch oculto **não custam nada** (não há assinantes).
- `open = false; open = true` no mesmo tick: zero operações no DOM.
- Condicionais aninhadas: o owner interno é filho do externo; fechar o externo descarta tudo de uma vez.
- Dentro de item de lista: cada item tem seu owner; a condicional fica dentro dele.

### Forçar recriação

```tsx
<ProfileForm key={user.id} user={user} />
```

### Preservar ao esconder

| Estratégia | Sintaxe | Nós | Efeitos | Estado |
|---|---|---|---|---|
| Remover (padrão) | `{cond && <X />}` | removidos | descartados | perdido |
| Esconder | `<X hidden={!cond} />` | no DOM | continuam | mantido |
| Manter vivo (fase 2) | `{cond && <X keep:alive />}` | desanexados | pausados | mantido |

### Refs em branches

`let input: HTMLInputElement | undefined` → atribuído ao ativar, `undefined` ao desativar. Tipar com `!:` em elemento condicional gera o aviso `ref-non-optional-in-branch`.

### Animação de saída (fase 2)

`{open && <Modal transition:out={fadeOut} />}`: a remoção dos nós é adiada até a animação terminar; os efeitos já são descartados no início.

## Early return reativo

O dev escreve o código natural; o compilador transforma em branches.

```tsx
export function UserPage({ id }: { id: string }) {
  const user = useFetch<User>(`/api/users/${id}`)

  if (user.error) return <ErrorBox message={user.error.message} />
  if (!user.data) return <Spinner />

  // daqui para baixo o TS sabe que user.data existe, e o runtime garante
  let tab = 'posts'
  const fullName = `${user.data.firstName} ${user.data.lastName}`

  return <div><h1>{fullName}</h1><Tabs value={tab} onChange={t => (tab = t)} /></div>
}
```

Regras:

1. **Setup**: tudo antes do primeiro `return` condicional roda uma vez.
2. Cada `if (cond) return X` vira um ponto de decisão `memo(() => !!cond)`.
3. O código **depois** do `if` é a **continuação**: roda dentro de um owner próprio quando o branch fica ativo.
4. Instruções dentro do bloco do `if` antes do `return` (`if (x) { log(); return <A/> }`) rodam a cada ativação daquele branch, no owner do branch.
5. `let`/`const` na continuação pertencem a ela: **se o branch for desativado e reativado, esse estado reseta** (`tab` volta a `'posts'`). O compilador avisa com `continuation-state-resets`; para manter, declare o `let` antes do primeiro `return`.
6. `if/else if/else` e `switch` com `return` em cada `case` são suportados. `return` dentro de `for`/`while`/`try` é erro `return-in-loop-or-try`. `return` dentro de callbacks não é return do componente.

## Listas

```tsx
<ul>
  {todos.filter(t => !t.done).map((todo, i) => (
    <li key={todo.id} class={{ odd: i % 2 }} onClick={() => remove(todo)}>
      {i + 1}. {todo.text}
    </li>
  ))}
</ul>
```

- `.map` com JSX vira uma lista com chave que **reaproveita nós**: inserir, remover e mover custa só os nós afetados; mudar `todo.done` atualiza só a classe daquele `<li>`.
- Cadeias `.filter(...).map(...)`, `.slice().map(...)` etc. são tratadas como uma lista com uma fonte.
- `const rows = items.map(i => <Row/>)` fora do JSX recebe a mesma transformação.
- **`key`**: opcional. Sem ela, o runtime usa `item.id ?? item.key ?? referência` para objetos e o índice para primitivos. O compilador avisa `prefer-key-in-list` quando a fonte pode ser **substituída** (um `let` reatribuído em algum lugar, um store ou um `await`) e o item é primitivo ou não é literal com `id`; o devtools aponta `list-recreated` se, mesmo assim, a lista foi recriada inteira.
- O **índice** `i` é vivo: mover itens atualiza quem lê `i` sem recriar o nó.
- Cada item tem seu owner: estado local, efeitos e condicionais do item morrem com ele.
- O item é um objeto reativo: `todo.text` dentro do item assina só aquele campo.
- Listas aninhadas, listas de componentes e `<Fragment key>` funcionam.
- O devtools aponta `list-recreated` quando um flush descartou e recriou todos os itens.

## Owner tree

```
root
 └─ App
     ├─ binding: insert(title)
     ├─ branch (loggedIn ? …)
     │   └─ Dashboard
     │       ├─ useFetch(...)  ← efeitos da use* pertencem a Dashboard
     │       └─ list(todos)
     │           ├─ item owner (todo#1) ─ bindings…
     │           └─ item owner (todo#2) ─ bindings…
     └─ <Boundary> (owner com fronteira de pending/erro)
```

Cada componente, branch, item de lista, continuação de `await` e `<Boundary>` é um owner. Descartar um owner descarta todos os descendentes de uma vez. O owner carrega também o mapa de contexto (`createContext`) e a fronteira de erro mais próxima.

## Testes de contrato

- Alternar `cond` N vezes cria/descarta exatamente N instâncias e a contagem de assinantes volta a zero.
- `true → false → true` no mesmo tick: 0 mutações no DOM (`MutationObserver`).
- Early return: trocar `user.data` para `null` nunca lança `Cannot read properties of null`.
- Lista com chave: inserir no início move 1 nó e não recria os outros; mudar um campo de um item executa só os bindings daquele item.
