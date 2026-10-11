# 01 — Modelo mental

## A regra de ouro

> **O corpo de um componente (ou de uma função `use*`) roda uma vez, de cima para baixo, como JS.**
> **O que está no JSX, em `watch` ou em um `const` que lê estado é vivo.**
> **Reatribuir um `let` ou mutar um objeto é o que dispara a atualização.**

## A tabela de uma página

| Você escreve | O que é | Quando atualiza |
|---|---|---|
| `let x = 0` | estado | ao reatribuir (`x = 1`, `x++`, `x += 2`) |
| `let user = {…}` / `const list = []` | estado (objeto reativo) | ao mutar (`user.name = …`, `list.push(…)`) e, no `let`, ao reatribuir |
| `const errors = { get name() { … } }` | um derivado por getter | quando o que cada getter lê muda |
| `const y = x * 2` | derivado (somente leitura) | quando `x` muda e alguém lê `y` |
| `const fn = () => …` / `function fn() {}` | função estável | nunca |
| `const user = await api.get(id)` | recurso | quando `id` muda (cancela o anterior; mantém o conteúdo antigo) |
| `watch(() => …)` | efeito | quando algo lido muda; cleanup antes de rodar de novo |
| `on(alvo, ev, fn)` | listener | removido no unmount |
| `external(create, update?)` | objeto com ciclo de vida | `update` quando algo lido muda; destruído no unmount |
| `{a ? <X/> : <Y/>}` / `if (a) return <X/>` | branch | só quando `a` muda de lado |
| `{items.map(i => <Row key={i.id} />)}` | lista com chave | move/insere/remove nós; itens mantêm estado |
| `({ user })` nas props | leitura lazy | só o binding que lê `user` reage |
| `useAlgo(arg)` | função reativa | o corpo dela segue as mesmas regras; `arg` é lazy |

Tudo o que não está nessa tabela é JavaScript comum.

## Corpo reativo

Só dois lugares têm "corpo reativo", onde `let`/`const` ganham a semântica da tabela:

1. **Componentes**: função em PascalCase que retorna JSX, em um arquivo `.tsx`.
2. **Funções `use*`**: função declarada no escopo do módulo cujo nome começa com `use`, em `.ts` ou `.tsx` ([03 §Funções use*](03-estado-e-derivados.md#funções-use)).

Dentro desses corpos, só o **escopo raiz** é reativo. Um `let` dentro de um handler, de um loop, de um `if` ou de um callback é JS normal.

## Consequências que valem a pena decorar

### O inicializador roda uma vez

```tsx
function Form({ value }: { value: string }) {
  let draft = value          // cópia: NÃO acompanha `value` (igual a useState(props.value))
  const upper = value.toUpperCase()   // derivado: acompanha `value`
}
```

Quando quiser "estado local que reseta quando a prop muda", use um dos dois padrões, sem API nova:

```tsx
watch(() => { draft = value })     // sincroniza sempre que `value` mudar
<Form key={user.id} value={…} />   // recria o componente quando o id muda
```

### Closures leem o valor atual

Handlers, `setTimeout`, promessas: tudo lê o valor **atual** da variável, porque o compilador reescreve a leitura para o signal. Não existe stale closure. Para congelar um valor, copie para um `const` dentro do handler.

```tsx
function save() {
  const snapshot = draft       // congela
  setTimeout(() => console.log(draft, snapshot), 1000)   // draft = atual, snapshot = congelado
}
```

### Leitura síncrona, DOM no microtask

```tsx
count++
console.log(count)        // valor novo
console.log(double)       // derivado já recalculado
input.focus()             // ⚠️ o DOM ainda não atualizou
await tick()
input.focus()             // ✓
```

Vários `set` no mesmo tick resultam em **um** flush. Alternar `open = false; open = true` no mesmo handler custa zero operações no DOM.

### Derivados são somente leitura

Atribuir a um `const` já é erro de TS. Mutar o objeto que um derivado devolveu (`active.push(x)`) é aviso em dev (`derived-mutated`): o resultado é recomputado e a mutação se perde.

### Efeitos não entram em loop

Um efeito que escreve no que ele mesmo lê é interrompido após 100 execuções seguidas, com erro apontando a variável e a linha.

## Vindo do React: o que sai e o que entra

| Sai | Entra | Por quê |
|---|---|---|
| `useState` | `let` | o compilador gera o signal |
| `useMemo`, `useCallback`, `memo` | `const`, função normal, nada | o componente roda uma vez; só o nó muda |
| `useEffect` + deps | `watch` (sem deps), `on`, `external` | dependências rastreadas pela leitura |
| `useRef` | `let el!: HTMLElement` + `ref={el}` | o compilador atribui o elemento |
| Regras dos hooks | nenhuma | funções `use*` são funções comuns |
| Virtual DOM | template clonado + bindings | nada a comparar: o compilador sabe o que é dinâmico |
| `className`, `htmlFor` | `class`, `for` (autofix) | é HTML |
| `value` + `onChange` em cada tecla | `value={x}` | o compilador gera o handler; `onChange` é o nativo |
| `dangerouslySetInnerHTML` | `innerHTML` | — |
| `<Suspense>` + ErrorBoundary + estados de loading | `await` + `<Boundary pending error>` | o compilador gera o recurso |
| Custom hooks | funções `use*` | mesmas regras do componente, sem restrições de ordem |
| `Children.map` + `child.type === X` | `<Slot name>` + `useSlots` | o compilador separa os slots em build |
| Zustand com seletores | `createStore` sem seletores | o proxy rastreia por propriedade |

O que **fica igual**: JSX, componentes como funções, props, `children`, `key`, `ref`, `onClick`, fragmentos, composição, fluxo unidirecional.
