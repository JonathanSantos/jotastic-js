# 05 — JSX

O JSX é o do React. As diferenças existem só onde o React se afasta do HTML/DOM, e o compilador avisa (com autofix) em cada uma.

## Elementos e atributos

```tsx
<div
  class={{ active: isActive, disabled }}          // objeto, string ou array
  style={{ color, fontSize: `${size}px` }}        // objeto (camelCase ou kebab-case) ou string
  data-id={id}
  aria-label="Fechar"
  tabIndex={0}
  hidden={!open}
  innerHTML={html}
/>
```

| Regra | Detalhe |
|---|---|
| **Nomes** | Os do React em camelCase (`tabIndex`, `readOnly`, `maxLength`) **e** os do HTML em minúsculas: os dois são aceitos e normalizados em build. `class` e `for` no lugar de `className`/`htmlFor` (aviso `class-name-alias` com autofix) |
| **Booleanos** | `disabled={x}` adiciona/remove o atributo |
| **`class`** | String, array (`['btn', active && 'on']`) ou objeto (`{ on: active }`). Objeto vira um `classList.toggle` por chave |
| **`style`** | Objeto vira um `style.setProperty` por propriedade; chaves camelCase viram kebab em build. Variáveis CSS funcionam (`'--x': v`) |
| **Propriedade vs atributo** | O compilador usa uma tabela: `value`, `checked`, `selected`, `innerHTML`, `textContent` são propriedades; `data-*`, `aria-*`, SVG e desconhecidos são atributos |
| **`innerHTML`** | Substitui `dangerouslySetInnerHTML`. Sem sanitização |
| **`hidden`** | É só o atributo nativo. Efeitos do conteúdo continuam rodando. Perde para `display` definido em CSS |
| **SVG/MathML** | Detectado pelo compilador; namespace correto |

## Expressões

- `{texto}`, `{numero}`: texto. `{0}` renderiza `0` (como no React).
- `{null}`, `{undefined}`, `{false}`, `{true}`: nada.
- `{elemento}`, `{array}`: inseridos. Arrays de elementos sem `.map` são estáticos.
- `{cond && <X/>}`, `{a ? <X/> : <Y/>}`: branches ([06](06-controle-de-fluxo.md)).
- `{items.map(...)}`: lista com chave ([06](06-controle-de-fluxo.md#listas)).

## Eventos

```tsx
<button onClick={() => count++}>+</button>
<form onSubmit={e => { e.preventDefault(); save() }}>
<input onInput={e => (query = e.currentTarget.value)} />
<div onScrollCapture={track} />
<my-element on:item-selected={e => select(e.detail)} />
```

| Regra | Detalhe |
|---|---|
| **Nomes** | `onX` camelCase do React, mapeado para o evento nativo em minúsculas (`onClick` → `click`, `onDblClick` → `dblclick`). `onXCapture` usa `{ capture: true }`. `on:nome-exato` para eventos customizados |
| **Semântica nativa** | `onChange` é o `change` do DOM (dispara ao sair do campo). Para cada tecla, `onInput`. Dica `on-change-on-input` quando `onChange` aparece junto de `value=` em `input`/`textarea` |
| **Listeners diretos** | Cada handler é um `addEventListener` no próprio elemento. `stopPropagation`, `currentTarget`, ordem de bubbling e Shadow DOM funcionam exatamente como no DOM. (Delegação local em listas só se o benchmark do M3 provar ganho ≥ 10%, e nunca no `document`) |
| **Handlers são estáveis** | A função é criada uma vez e lê sempre o valor atual. Sem `useCallback` |
| **Erros** | Exceções (síncronas ou promise rejeitada) em handlers vão para o `<Boundary>` mais próximo ([09](09-erros.md)) |
| **Tipagem** | `e.currentTarget` tipado pelo elemento |

## Formulários: `value` e `checked` são two-way

Sem sintaxe nova: são os atributos do React. A diferença é que **o compilador escreve o handler**:

```tsx
<input value={name} />                                   // string
<input type="number" value={age} />                      // number | null (NaN vira null)
<input type="checkbox" checked={done} />                 // boolean
<select value={plan}>…</select>                          // string
<select multiple value={tags}>…</select>                 // string[]
<textarea value={bio} />
<input type="radio" name="plan" value="pro" checked={plan === 'pro'} onChange={() => (plan = 'pro')} />   // radio: explícito
```

Regras:

- `value`/`checked` em campo editável, **sem** `onInput`/`onChange` e com uma expressão **atribuível** (`let`, `obj.campo`, `arr[i]`) vira two-way: o compilador gera o handler com coerção pelo `type` literal. É o caso que o React trata como bug ("value sem onChange"), então nenhum uso legítimo é perdido.
- Com handler presente, é one-way + o seu handler, igual ao React. `readOnly` ou `disabled` também desligam.
- Expressão não atribuível (`value={x.trim()}`, uma prop) é one-way, com a dica `value-not-writable` em dev.
- Em **spread** (`<input {...f.field('name')} />`), a mesma regra vale em runtime: `value`/`checked` com **setter** no objeto e sem handler viram two-way. É o que permite receitas como `useForm` ([examples/14](examples/14-use-form.ts)).
- O runtime só escreve `el.value` quando difere do atual, então o caret não pula.
- Em componentes, a convenção explícita do React: `<Modal open={x} onOpenChange={v => (x = v)} />`.

## `ref`

```tsx
let el!: HTMLDivElement
<div ref={el} />
```

Ver [02](02-componentes.md#ref). Também aceita função: `ref={node => registry.add(node)}`.

## Fragmentos

```tsx
<>
  <dt>{term}</dt>
  <dd>{def}</dd>
</>
```

Viram um array de nós, sem elemento wrapper. `<Fragment key={…}>` em listas também funciona.

## Vindo do React: tabela de migração

| React | Jotastic | Compilador |
|---|---|---|
| `className` | `class` | aviso + autofix |
| `htmlFor` | `for` | aviso + autofix |
| `onChange` (cada tecla) | `onInput` | dica |
| `value` + `onChange` controlado | `value` (two-way automático) | — |
| `defaultValue` | `let x = inicial` + `value={x}` | — |
| `dangerouslySetInnerHTML={{ __html }}` | `innerHTML={html}` | erro com autofix |
| `style={{ fontSize: 12 }}` | igual (`12` vira `12px` nas propriedades numéricas conhecidas) | — |
| `key` obrigatória em listas | opcional, com dica quando importa | dica |
| `ref={useRef()}` | `ref={variavel}` | — |
| `{cond && <X/>}` | igual | — |
| `{list.map(…)}` | igual | vira lista com chave |
| `<></>` | igual | — |
