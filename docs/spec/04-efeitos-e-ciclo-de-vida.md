# 04 — Efeitos e ciclo de vida

Efeitos são raros no Jotastic. A maior parte do que era `useEffect` no React vira um derivado (`const`), um binding no JSX, um `on` ou um `external`. Só use `watch` para sincronizar com o mundo externo (título da página, storage, analytics, log).

| API | Para quê | Frequência |
|---|---|---|
| `const` | Valores derivados | sempre |
| `on(alvo, evento, fn)` | Listeners em `window`/`document`/qualquer `EventTarget` | comum |
| `external(create, update?, destroy?)` | Libs e objetos com ciclo de vida | comum |
| `watch(fn)` | Sincronizar com o mundo externo | raro |
| `onMount(fn)` | Algo pontual depois de montar (focus, medir) | raro |
| `onCleanup(fn)` | Cleanup manual | raro |
| `tick()` | Esperar o DOM atualizar | raro |
| `inspect(x)` | Logar um valor a cada mudança (só em dev) | debug |
| `untrack(fn)` | Ler sem assinar | muito raro |

## `watch`

```tsx
watch(() => {
  document.title = `${count} itens`
})

watch(() => {
  const ctrl = new AbortController()
  fetch(`/api?q=${query}`, { signal: ctrl.signal })
  return () => ctrl.abort()          // cleanup: roda antes da próxima execução e no unmount
})
```

- **Sem array de dependências.** Tudo o que o efeito lê é assinado; as dependências são recoletadas a cada execução (branches não ativos não são assinados).
- Roda **depois** do componente ser montado no DOM (refs já existem) e depois de cada flush em que uma dependência mudou.
- Pode escrever em estado. Um efeito que escreve no que lê é interrompido após 100 execuções (`effect-loop`).
- É descartado com o owner (componente, branch ou item de lista).
- Um `watch` que não lê nada reativo recebe o aviso `watch-without-reads` (provavelmente devia ser `onMount`).
- Dentro do efeito, `abortSignal()` (e o `fetch` de `jotastic/fetch`) devolve um signal **abortado no cleanup**: requisições disparadas pelo efeito são canceladas quando ele roda de novo ou é descartado, sem `AbortController` manual.
- Uma instrução solta no corpo raiz que lê estado (`console.log(count)`) recebe `state-read-in-setup` com autofix "envolver em `watch`".

## `on`

```tsx
on(window, 'resize', () => (width = window.innerWidth))
on(document, 'keydown', e => e.key === 'Escape' && close(), { passive: true })
on(socket, 'message', handle)       // qualquer EventTarget
```

- Tipado pelo mapa de eventos do alvo. Removido automaticamente no unmount.
- **O alvo é lazy**: `on(mql, 'change', …)` com `mql` derivado re-liga quando `mql` muda; `on(el, …)` com `el` vindo de `ref` liga quando o elemento existir. Nada a fazer no cleanup.
- Para elementos do próprio JSX, use `onClick` etc. ([05](05-jsx.md#eventos)).

## `external`

Para libs e objetos com ciclo de vida: Chart.js, Leaflet, Monaco, WebSocket, observers, players.

```tsx
let canvas!: HTMLCanvasElement

// Atualiza sem recriar
const chart = external(
  () => new Chart(canvas, { type: 'bar', data }),       // create: roda DEPOIS de montar
  (chart) => { chart.data = data; chart.update() },     // update: roda quando algo lido aqui muda
)

// Recria quando a dependência muda (destrói o anterior)
const socket = external(() => new WebSocket(`/rooms/${roomId}`))

// Destruição customizada
const map = external(() => L.map(el), undefined, (m) => m.remove())
```

Regras:

- `create` roda depois de montar, então refs já existem. O valor fica disponível de forma lazy: ler `chart` no corpo raiz antes de montar é erro (`ref-before-mount`); ler em handlers, `watch` e `update` é seguro.
- **Com `update`, nunca recria.** Sem `update`, recria quando algo lido no `create` muda.
- **Destruição automática** no unmount e antes de recriar. O runtime chama o primeiro que existir: `[Symbol.dispose]`, `destroy`, `dispose`, `disconnect`, `unsubscribe`. `close`/`abort`/`terminate` só para tipos conhecidos (`WebSocket`, `EventSource`, `AbortController`, `Worker`, `MessagePort`, `IDBDatabase`), para nunca chamar um `close()` que "fecha um painel".
- O terceiro argumento substitui a escolha automática. O devtools mostra qual método foi chamado.

## `onMount` e `onCleanup`

```tsx
onMount(() => input.focus())
onCleanup(() => clearInterval(id))
```

Rodam uma vez. Cleanups rodam em ordem reversa quando o owner é descartado. Podem ser chamados em qualquer lugar do corpo reativo, inclusive dentro de funções `use*` e de `if`s.

## `tick`

```tsx
async function startEdit() {
  editing = true
  await tick()          // espera o flush do DOM
  input.focus()
}
```

Para o caso mais comum, `autofocus` em um elemento recém-criado já funciona: o runtime chama `.focus()` ao inserir.

## `inspect`

```tsx
inspect(count, todos)      // dev: loga nome, arquivo, linha e o valor a cada mudança; removido em prod
```

Substitui o `watch(() => console.log(x))` de debug. O devtools lista os `inspect` ativos.

## `untrack`

```tsx
const initial = untrack(() => props.value)    // lê sem criar dependência
```

Escape raro. O compilador já usa `untrack` internamente nos inicializadores de `let`.

## Ordem de execução

1. Corpo do componente (setup) roda de cima para baixo.
2. Template é clonado, bindings criados, `ref`s atribuídos.
3. Nós inseridos no DOM.
4. `onMount`, depois `external.create`, depois `watch` (primeira execução), na ordem do código.
5. A cada flush: owners de cima para baixo (pai decide antes do filho), dentro de um owner na ordem de criação.
6. Ao descartar: cleanups em ordem reversa, `external.destroy`, nós removidos.
