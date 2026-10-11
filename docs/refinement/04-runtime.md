# 04 — Runtime

O runtime é o que o código compilado chama. Meta: **< 5 KB gzip** no MVP.

## Primitivas de reatividade

```ts
signal<T>(initial: T): { get(): T; set(v: T): void }
computed<T>(fn: () => T): { get(): T }
watch(fn: () => void | (() => void)): Dispose
batch(fn: () => void): void
untrack<T>(fn: () => T): T
store<T extends object>(obj: T): T            // proxy profundo
```

### Algoritmo: push-pull com coloração

1. **Push (barato):** `signal.set()` marca os dependentes diretos como `DIRTY` e os indiretos como `CHECK`. Nada é recalculado ainda.
2. **Agendamento:** os efeitos marcados entram numa fila, que é processada em **microtask** (batching automático).
3. **Pull (preguiçoso):** ao rodar, um efeito `CHECK` pergunta às fontes se de fato mudaram. Um `computed` recalcula e, se o valor for `Object.is` igual ao anterior, o efeito é **descartado** sem rodar.

Isso dá os guards pedidos:

| Guard | Evita |
|---|---|
| `set` com mesmo valor é no-op | Atualização inútil |
| `computed` com mesmo resultado corta a propagação | Cascata desnecessária |
| Batching em microtask | Vários `set` seguidos causarem várias atualizações |
| Coloração DIRTY/CHECK | "Glitches" (estado intermediário inconsistente) e recalcular o que ninguém lê |
| Dependências dinâmicas re-coletadas a cada execução | Assinar sinais de branches que não estão mais ativos |

> Referência de implementação: o algoritmo do `alien-signals` / Preact Signals / proposta TC39 Signals. Podemos começar com uma implementação própria simples (~150 linhas) e trocar depois.

## Proteção por valor em objetos (igualdade profunda otimizada)

Objetivo: **um objeto novo com os mesmos valores não deve disparar atualização**, mesmo com referência diferente. Comparar tudo com deep-equal a cada mudança seria caro (O(n) por escrita, muitas vezes mais caro que a própria atualização do DOM). Por isso a proteção é feita em **três camadas**, cada uma com o custo mínimo para o seu caso.

### Camada 1 — Folha a folha (proxy)

```ts
todo.done = true      // já era true → no-op (Object.is por propriedade)
user.name = 'Ana'     // só quem lê `user.name` é notificado
```

Custo O(1). Cobre todas as mutações diretas.

### Camada 2 — Reconcile na substituição de objetos inteiros

Quando um objeto/array inteiro é atribuído (`user = novoUser`, `set({ items: [...] })`, resposta de API), o runtime **não troca a referência**: ele percorre o valor novo contra o antigo e aplica só as diferenças no proxy existente.

```ts
let user = { name: 'Ana', address: { city: 'SP' }, tags: ['a', 'b'] }

user = { name: 'Ana', address: { city: 'RJ' }, tags: ['a', 'b'] }
// → só `user.address.city` notifica. `name`, `tags` e quem lê `user.address` não são afetados.

user = await api.getUser(id)      // resposta idêntica à anterior → zero atualizações
```

Otimizações do reconcile:

| Técnica | Efeito |
|---|---|
| **Mesma referência → pula a subárvore** | Atualizações imutáveis (`{...s, a: 1}`) custam O(caminho alterado), não O(objeto inteiro) |
| **Arrays reconciliados por chave** (`id` por padrão, configurável) | Inserir no meio não "muda" todos os itens seguintes; itens mantêm identidade e o `list` só move nós |
| **Tipos especiais** | `Date` por `getTime()`, `Map`/`Set` por entradas, `RegExp` por `source+flags` |
| **Objetos não-plain** (instâncias de classe, DOM, `File`...) | Comparados por referência (não são invadidos) |
| **Ciclos** | Protegidos com `WeakSet` de visitados |
| **Comparação lazy de subárvores não lidas** | Se ninguém nunca leu `user.address`, essa subárvore é só substituída, sem percorrer |

O último item é o mais importante: o reconcile **só desce em caminhos que têm assinantes**. Um JSON grande de API em que a UI usa 3 campos custa ~3 comparações.

### Camada 3 — Resultado de derivados

```ts
const active = todos.filter(t => !t.done)   // gera array novo sempre que recalcula
```

Os `computed` comparam com `Object.is` e, se ambos forem arrays ou objetos plain, fazem uma **comparação rasa** (mesmo tamanho e mesmos elementos por referência). Assim um `filter` que resultou nos mesmos itens **não** propaga. Uma comparação profunda aqui não vale o custo: os elementos já são proxies estáveis, então a comparação rasa basta.

### Escape hatch: `raw()`

Para dados grandes e imutáveis (datasets de gráfico, respostas de 10k linhas usadas só como bloco):

```ts
let points = raw(await api.getSeries())   // sem proxy, sem reconcile, comparação por referência
```

### Testes de contrato

- Atribuir um objeto profundamente igual resulta em 0 effects executados.
- Alterar 1 campo em um objeto de 10k nós, com 3 campos lidos, faz o reconcile visitar apenas ~3 caminhos.
- Inserir um item no início de uma lista com chave move 1 nó e não recria os outros.

## Binding direto no DOM (sem VDOM)

"Prender o componente ao elemento" acontece assim:

- O template é clonado **uma vez** por instância.
- Cada parte dinâmica vira um **effect** que guarda a referência direta ao nó (`TextNode`, `Element`, atributo).
- Atualizar = escrever direto no nó: `textNode.data = v`, `el.setAttribute(...)`, `el.classList.toggle(...)`.

```ts
function text(node: Text, read: () => unknown) {
  watch(() => {
    const v = String(read() ?? '')
    if (node.data !== v) node.data = v       // guard extra no DOM
  })
}
```

### Owner tree (escopos)

Não há "árvore de componentes" em runtime como no React. Há uma **árvore de owners**: cada componente, branch condicional e item de lista cria um escopo que é dono dos seus effects. Ao desmontar um branch, o owner descarta todos os effects e cleanups de uma vez. É isso que evita vazamento de memória.

```
root owner
 └─ App
     ├─ effect: text(title)
     ├─ branch (loggedIn ? ... )
     │   └─ Dashboard
     │       └─ list(todos)
     │           ├─ item owner (todo#1) ─ effects...
     │           └─ item owner (todo#2) ─ effects...
     └─ ...
```

## Inserção dinâmica: `insert`

Para `{expr}` cujo resultado pode ser texto, nó, array ou componente. Usa um **comentário marcador** (`<!>`) como âncora e substitui só o intervalo entre âncoras.

## Listas: `list`

Reconciliação por chave sobre **nós reais**:
- Mantém `Map<key, { nodes, owner }>`.
- Itens novos são criados, removidos são descartados (owner.dispose) e os existentes são **movidos**, não recriados.
- Algoritmo: LIS (longest increasing subsequence) para minimizar movimentações. Pode ser pós-MVP; o MVP pode usar um algoritmo simples de prefixo/sufixo + map.

## Eventos

- **Delegados** (click, input, keydown, submit...): um listener no `document` por tipo, que sobe pelo `event.target` procurando `$$click`.
- **Não delegados** (focus, blur, scroll, mouseenter...): `addEventListener` direto.

## Store (proxy profundo)

- Proxy criado **lazy**: só quando a propriedade é acessada.
- Cada propriedade tem seu próprio signal interno, então ler `todo.done` assina só `done`.
- Métodos de array (`push`, `splice`, `sort`...) são agrupados em batch e notificam `length` e os índices afetados.
- `getters` viram `computed` automaticamente.

## API pública (pacote `jotastic`)

```ts
mount(el: JSX.Element, target: Element | string): () => void
createApp(el: JSX.Element): App        // .use() .onError() .mount() .unmount()
watch, onMount, onCleanup, expose, batch, untrack, raw
pending, refresh, abortSignal           // async (ver 11)
Catch, Async                            // componentes de fronteira
```

Pacote `jotastic/store`: `createStore`, `persist` (ver [10-store](10-store.md)).

O resto (`signal`, `computed`, `template`, `text`, `insert`, `list`, `delegate`...) fica em `jotastic/runtime` e é usado pelo código compilado.
