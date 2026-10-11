# 09 — Condicionais: remover e reinserir elementos no DOM

Como o componente roda uma vez e os bindings apontam para nós reais, precisamos definir com precisão o que acontece quando uma condição **remove** um pedaço da UI e depois **devolve**.

## Conceito: branch = owner

Cada lado de uma condicional é um **branch**, com seu próprio **owner** (escopo que é dono de nós, effects, `watch`, `onCleanup` e componentes filhos).

```
{open ? <Panel /> : <Collapsed />}

        cond = computed(() => !!open)      ← guard: só muda quando inverte
          │
   ┌──────┴───────┐
 branch true    branch false
 owner + nós    owner + nós
```

Ciclo de um branch:

| Evento | O que acontece |
|---|---|
| **Ativar** | Clona o template, cria os bindings, roda o setup dos componentes, insere os nós entre as âncoras e roda `onMount` |
| **Desativar** | `owner.dispose()`: roda os cleanups dos `watch`/`onCleanup` (em ordem reversa), desliga os bindings dos signals e remove os nós do DOM |
| **Reativar** | Cria **uma nova instância** (estado novo), a menos que o branch use `keep:alive` (ver cenário 8, pós-MVP) |

---

## Cenários

### 1. `&&` liga/desliga um elemento

```tsx
{showHelp && <p class="help">{helpText}</p>}
```

- `false → true`: cria o `<p>` e o binding de `helpText`.
- `true → false`: remove o `<p>` e descarta o binding (`helpText` deixa de ter esse assinante).
- Mudanças em `helpText` enquanto oculto **não custam nada**.

### 2. Ternário alternando dois componentes

```tsx
{loggedIn ? <Dashboard /> : <Login />}
```

Ao trocar, um branch é descartado por inteiro (incluindo filhos, efeitos e requisições em andamento com AbortSignal) e o outro é criado.

### 3. A condição muda de valor mas não de lado

```tsx
{user ? <Profile user={user} /> : <Login />}
```

`user` muda de `{id: 1}` para `{id: 2}`: `!!user` continua `true`, então o branch **não é recriado**. A prop `user` (getter) propaga o novo valor e só os bindings que leem campos que mudaram atualizam.

### 4. Alternância rápida no mesmo tick

```ts
open = false
open = true          // no mesmo handler
```

Graças ao batching em microtask, no flush `!!open` vale `true` de novo, igual ao anterior: **zero operações no DOM**, sem destruir e recriar.

### 5. Múltiplos branches (switch)

Todas estas formas compilam para um `switch` reativo com chave memoizada:

```tsx
{status === 'loading' ? <Spinner /> : status === 'error' ? <Error /> : <List />}

{{ loading: <Spinner />, error: <Error />, ok: <List /> }[status]}
```

Os objetos literais são compilados de forma lazy: só o branch selecionado é criado.

### 6. Condicionais aninhadas

```tsx
{open && (
  <Panel>
    {advanced && <AdvancedOptions />}
  </Panel>
)}
```

O owner interno é filho do externo. Fechar `open` descarta `Panel` **e** `AdvancedOptions` de uma vez. A ordem das atualizações é sempre **de cima para baixo** (o pai decide antes do filho), então um branch interno nunca roda de um pai que já está sendo descartado.

### 7. Condicional dentro de item de lista

```tsx
{todos.map(t => <li>{t.text}{t.editing && <input bind:value={t.text} />}</li>)}
```

Cada item tem seu owner, e a condicional fica dentro dele. Editar um item cria o `<input>` só naquele `<li>`.

### 8. Preservar estado ao esconder

Três estratégias, do mais leve ao mais "pesado":

| Estratégia | Sintaxe | Nós | Efeitos | Estado |
|---|---|---|---|---|
| **Remover** (padrão) | `{cond && <X />}` | Removidos | Descartados | Perdido |
| **Esconder** | `<X hidden={!cond} />` (atributo HTML nativo) | Continuam no DOM | Continuam rodando | Mantido |
| **Manter vivo** *(pós-MVP, D14)* | `{cond && <X keep:alive />}` | Desanexados (guardados em um `DocumentFragment`) | **Pausados**: marcados como sujos e rodam uma vez ao voltar | Mantido |

```tsx
{tab === 'editor' && <Editor keep:alive />}
{tab === 'preview' && <Preview />}
```

- `keep:alive` salva e restaura a posição de scroll e o foco dos elementos internos.
- `keep:alive={{ max: 5 }}` limita o cache (LRU) quando o branch é dinâmico (ex.: abas por id).

> **D14 (decidido): `keep:alive` fica fora do MVP.** Motivo: o `hidden` nativo já resolve "trocar de aba sem perder o que foi digitado", sem nenhuma API nova, e o `keep:alive` adiciona um estado novo ao runtime (owner pausado) que precisa de testes próprios. O owner tree será desenhado para permitir pausar, então adicionar depois não exige refatoração.

### 9. Forçar recriação com `key`

```tsx
<ProfileForm key={user.id} user={user} />
```

Quando `key` muda, a instância é descartada e recriada (o estado local reseta). Útil em formulários que devem limpar ao trocar de registro.

### 10. Refs em branches

```tsx
let input: HTMLInputElement | undefined
{editing && <input ref={input} />}
```

O `ref` é atribuído ao ativar e volta a ser `undefined` ao desativar. O compilador emite um aviso se a variável de ref de um elemento condicional for tipada como não-opcional (`let input!: HTMLInputElement`).

### 11. Animação de saída

```tsx
{open && <Modal transition:out={fadeOut} />}
```

A remoção dos nós pode ser **adiada** até a animação terminar. Os effects já são descartados no início, então a UI que está saindo fica "congelada". (Pós-MVP, mas o runtime já nasce com remoção assíncrona.)

### 12. Componente que retorna `null`/`false`

```tsx
function Badge({ count }: { count: number }) {
  return count > 0 ? <span>{count}</span> : null
}
```

Funciona igual a um ternário. O componente renderiza só a âncora (comentário) quando o valor é vazio.

### 13. Condição em atributo (não em nó)

```tsx
<button class={loading ? 'btn loading' : 'btn'} disabled={loading}>
```

Isso **não** é um branch: são bindings de atributo, e nada é criado ou removido.

---

## Early return reativo (decidido: entra no MVP)

O dev escreve código "natural" e o compilador transforma em branches.

### Entrada

```tsx
export function UserPage({ id }: { id: string }) {
  let user: User | null = null
  let error: string | null = null

  watch(() => {
    api.getUser(id).then(u => (user = u)).catch(e => (error = e.message))
  })

  if (error) return <ErrorBox message={error} />
  if (!user) return <Spinner />

  // daqui pra baixo o TS sabe que `user` não é null
  let tab = 'posts'
  const fullName = `${user.firstName} ${user.lastName}`

  return (
    <div>
      <h1>{fullName}</h1>
      <Tabs value={tab} onChange={t => (tab = t)} />
    </div>
  )
}
```

### Regras de transformação

1. **Setup**: tudo antes do primeiro `return` condicional roda uma vez (estado, `watch`, funções).
2. Cada `if (cond) return X` vira um ponto de decisão com `computed(() => !!cond)`.
3. O código **depois** do `if` vira a **continuação**: uma função executada dentro de um owner próprio, criada quando o branch fica ativo.
4. `let`/`const` declarados na continuação pertencem a ela. **Se o branch for desativado e reativado, esse estado reseta** (ex.: `tab` volta para `'posts'` se `user` virar `null` e depois voltar). **D13 (decidido):** aceitamos esse comportamento, e o compilador emite o aviso `continuation-state-resets` apontando a variável e a condição que a reseta.
5. **Narrowing do TS é preservado em runtime**: como as atualizações rodam de cima para baixo, o ponto de decisão `!user` é avaliado antes de qualquer binding da continuação. Se `user` virar `null`, a continuação é descartada antes de alguém ler `user.firstName`. Esse é o invariante crítico do runtime.

### Saída (aproximada)

```js
export function UserPage(props) {
  const user = signal(null)
  const error = signal(null)

  watch(() => { api.getUser(props.id).then(u => user.set(u)).catch(e => error.set(e.message)) })

  return branches([
    [() => !!error.get(), () => ErrorBox({ get message() { return error.get() } })],
    [() => !user.get(),   () => Spinner()],
  ], () => {
    // continuação
    const tab = signal('posts')
    const fullName = computed(() => `${user.get().firstName} ${user.get().lastName}`)
    const _el = _t0()
    text(_el.firstChild.firstChild, () => fullName.get())
    insert(_el, Tabs({ get value() { return tab.get() }, onChange: t => tab.set(t) }))
    return _el
  })
}
```

### Limites no MVP

| Caso | Suporte |
|---|---|
| `if (...) return` no topo do corpo | ✅ |
| `if / else if / else` com returns | ✅ |
| `switch` com `return` em cada `case` | ✅ |
| `return` dentro de `for`/`while` | ❌ erro com sugestão |
| `return` dentro de `try/catch` | ❌ erro (use `<Catch>`) |
| `return` dentro de callbacks (`.map`, handlers) | Não é return do componente, então é ignorado (JS normal) |

---

## Testes obrigatórios (contrato do runtime)

- Alternar `cond` N vezes cria/descarta exatamente N instâncias e **não vaza** effects (contagem de assinantes volta a zero).
- `true → false → true` no mesmo tick resulta em 0 mutações no DOM (verificado com `MutationObserver`).
- *(pós-MVP)* `keep:alive` não executa effects enquanto pausado e executa **uma** vez ao retomar.
- Early return: trocar `user` para `null` nunca lança `Cannot read properties of null`.
