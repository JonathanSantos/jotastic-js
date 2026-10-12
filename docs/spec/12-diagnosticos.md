# 12 — Diagnósticos

Catálogo único, com IDs estáveis usados pelo compilador, pelo plugin ESLint e pelo devtools. Nível: **E** erro, **W** aviso, **H** dica (só no editor/devtools).

Regra para entrar aqui: o gatilho é **sintático** (sem tipos) ou de **runtime em dev** com custo zero em prod. Toda mensagem tem arquivo, linha, explicação de uma frase e, quando possível, um `fix` mecânico.

## Compilação / editor

| ID | Nível | Gatilho | Fix |
|---|---|---|---|
| `return-in-loop-or-try` | E | `return` dentro de `for`/`while`/`try` no corpo raiz | sugere ternário ou `<Boundary>` |
| `await-in-try` | E | `await` dentro de `try` no corpo raiz (até a fase 2) | sugere `<Boundary error>` |
| `use-return-not-object` | E | função `use*` retorna um `let` solto ou expressão não-objeto | sugere `return { x }` |
| `ref-before-mount` | E | variável de `ref`/`external` lida no corpo raiz fora de `onMount`/`external`/handler | sugere mover para `onMount` ou `external` |
| `slot-not-direct-child` | E | `<Slot>` dentro de `.map`, de outro elemento ou de outro componente | sugere mover para o nível dos children |
| `inner-html-object` | E | `dangerouslySetInnerHTML={{ __html }}` | autofix → `innerHTML={…}` |
| `await-in-branch` | E | `await` dentro de `if` sem `return` no corpo raiz (MVP) | sugere mover para o topo ou para um handler |
| `list-const-used-twice` | E | `const rows = items.map(JSX)` inserido em mais de um lugar | sugere um componente |
| `slot-name-not-literal` | E | `<Slot name={expr}>` | exige string literal |
| `component-ref-unsupported` | E | `ref` em componente (fase 2) | sugere prop de callback |
| `use-spread-args-unsupported` | E | `useX(...xs)` | — |
| `use-param-assignment` | E | escrita em parâmetro de `use*` | sugere `let` local |
| `await-position-unsupported` | E | `await` em posição não coberta por 18 §10 | sugere `const x = await …` |
| `await-in-use-unsupported` | E | `await` no corpo raiz de `use*` (MVP) | sugere `watch` + promise |
| `pending-not-resource` | E | `pending(x)`/`refresh(x)` com `x` que não vem de `await` | — |
| `slot-mixed-branch` | H | `{c ? <Slot/> : <i/>}` | explica os getters complementares |
| `continuation-state-resets` | W | `let` declarado depois de um early return / `await` | explica; sugere mover para cima |
| `state-read-in-setup` | W | leitura solta no corpo raiz (`count;`) ou `console.*(…)` lendo estado/prop; chamadas de método (`tabs.register(id)`) não avisam | autofix: envolver em `watch` |
| `watch-without-reads` | W | `watch` cujo corpo não lê nada reativo | sugere `onMount` |
| `prefer-key-in-list` | W | `.map` com JSX sem `key`, fonte reatribuível e item **primitivo ou literal de objeto sem `id`**; shape desconhecido (await/store) não avisa | sugere `key={item.id}` |
| `class-name-alias` | W | `className` / `htmlFor` | autofix → `class` / `for` |
| `ref-non-optional-in-branch` | W | `ref` em elemento condicional com variável tipada `!:` | sugere `\| undefined` |
| `on-change-on-input` | H | `onChange` + `value=` em `input`/`textarea` | sugere `onInput` |
| `value-not-writable` | H | `value`/`checked` em campo editável sem handler cuja expressão não é atribuível (prop, chamada) | sugere copiar para `let` ou adicionar handler |
| `fetch-without-signal` | H | `fetch(` literal na expressão de um `await` de componente ou dentro de `watch`, sem `signal` | sugere `jotastic/fetch` ou `abortSignal()` |
| `await-waterfall` | H | dois `await` seguidos no corpo raiz sem dependência léxica | sugere `Promise.all` |
| `let-never-reassigned` | H | `let` no corpo raiz nunca reatribuído e nunca mutado | autofix → `const` |

Exclusões de `state-read-in-setup`: inicializadores de `let`/`const`, early returns com JSX, dentro de `onMount`/`watch`/handlers/`use*`.

## Runtime em dev

| ID | Nível | Gatilho | Mensagem aponta |
|---|---|---|---|
| `derived-mutated` | W | escrita no resultado de um derivado | a linha do `const` |
| `derived-recreates-instance` | W | derivado recalcula e devolve instância com método de ciclo de vida (`destroy`/`dispose`/`disconnect`/`close`/`unsubscribe`/`abort`) | sugere `external` com `update` |
| `store-mutated-outside-action` | W | escrita direta em store fora de uma ação | a linha da escrita e o nome do store |
| `effect-loop` | E | effect executa 100 vezes seguidas | variável escrita e linha do `watch` |
| `use-outside-owner` | E | `use*`/`watch`/`on`/`onMount` chamados fora de um corpo reativo | a chamada |
| `not-compiled` | E | marcador executado sem compilador (`Slot`, `external`, `pending` em valor comum) | a chamada |
| `mount-target-missing` | E | `mount(el, '#x')` sem elemento | o seletor |
| `context-missing` | E | `useContext` sem Provider nem default | a chamada |
| `list-duplicate-key` | W | duas linhas com a mesma chave | a lista |

## Devtools

| ID | Gatilho |
|---|---|
| `list-recreated` | um flush descartou e recriou todos os itens de uma lista (provavelmente falta `key`) |
| `binding-hot` | um binding rodou > 300 vezes em 1 s |
| `memo-never-read` | derivado nunca lido depois do setup |
| `signal-never-set` | `let` que nunca muda (poderia ser `const`) |

## Formato

```
✖ src/Profile.tsx:12:3  jotastic/return-in-loop-or-try
  Este `return` está dentro de um `for`; componentes executam uma vez e o compilador não consegue transformá-lo em branch.
  Sugestão: mova a condição para o JSX:
    return items.length ? <List items={items} /> : <Empty />
```

Mensagens no estilo Elm/Rust: o que aconteceu, por quê, o que fazer. Pensadas para humanos e para agentes de IA.
