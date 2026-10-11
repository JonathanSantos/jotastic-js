# 03 — Compilador

O compilador é o coração do projeto. Ele recebe TSX válido e emite JS que chama um runtime pequeno (ver [04-runtime](04-runtime.md)).

## Pipeline

```
.tsx ──► parse (Babel/TS) ──► detectar componentes ──► análise de escopo
     ──► classificar bindings (estado / derivado / estático)
     ──► transformar JSX em templates + bindings
     ──► reescrever leituras/escritas de estado
     ──► emitir JS + sourcemap
```

Integração: **plugin Vite** (MVP). O type-check fica com o `tsc` normal, já que a entrada é TSX válido.

```jsonc
// tsconfig.json do usuário
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "jotastic"
  }
}
```

## 1. Detecção de componente

É componente uma função que:
- tem nome em PascalCase (declaração, `const X = () =>` ou `export default function X`), **e**
- retorna JSX em algum caminho.

Só dentro de componentes é que `let`/`const` ganham semântica reativa.

## 2. Classificação de bindings

Para cada declaração no **escopo raiz** do componente:

| Declaração | Condição | Vira |
|---|---|---|
| `let x = ...` | É reatribuída/mutada em algum lugar **ou** lida em JSX/`watch` | `signal` |
| `let x = ...` | Nunca reatribuída | `const` simples (otimização) |
| `const x = expr` | `expr` lê signal, derivado ou prop | `computed` |
| `const x = expr` | `expr` é função/arrow | constante simples |
| `const x = expr` | `expr` não lê nada reativo | constante simples |
| `const x = f(...)` | chamada de função | derivado candidato (vira constante em runtime se não ler nada reativo) |
| `const x = <JSX/>` | — | constante (bindings internos vivos) |

> Regras fechadas no [tema 1](15-tema-01-modelo-mental.md).
| Parâmetro desestruturado | — | Reescrito para `props.x` |

As leituras são reescritas para `x.get()` (ou `props.x`) e as escritas para `x.set(...)`. Isso vale para **qualquer** lugar do escopo do componente, incluindo closures e handlers, o que elimina o problema de closures obsoletas.

## 3. JSX para template + bindings

O JSX é separado em:
- **parte estática**, que vira uma string HTML, parseada **uma vez por componente** e clonada com `cloneNode(true)`;
- **partes dinâmicas**, que viram chamadas de binding apontando para o nó exato.

### Exemplo completo

**Entrada:**

```tsx
export function Counter({ label, start = 0 }: { label: string; start?: number }) {
  let count = start
  const double = count * 2

  watch(() => console.log('count', count))

  return (
    <button class="btn" onClick={() => count++}>
      {label}: {count} (dobro: {double})
    </button>
  )
}
```

**Saída (aproximada, legível de propósito):**

```js
import { signal, computed, watch, template, text, delegate } from 'jotastic/runtime'

const _t0 = template('<button class="btn"> : <!> (dobro: <!>)</button>')

export function Counter(props) {
  const count = signal(props.start ?? 0)          // leitura inicial, sem rastreamento
  const double = computed(() => count.get() * 2)

  watch(() => console.log('count', count.get()))

  const _el = _t0()                                // clona o template
  const _a = _el.firstChild                        // nós resolvidos uma única vez
  const _b = _a.nextSibling.nextSibling
  const _c = _b.nextSibling.nextSibling

  _el.$$click = () => count.set(count.get() + 1)   // evento delegado

  text(_a, () => props.label)                      // cada binding é um efeito mínimo
  text(_b, () => count.get())
  text(_c, () => double.get())

  return _el
}

delegate(['click'])
```

Quando `count` muda:
1. `count.set` marca os dependentes como sujos (`text(_b)`, `double`).
2. No microtask, `text(_b)` atualiza **um** `TextNode`.
3. `double` recalcula; se mudou, `text(_c)` atualiza.
4. `text(_a)` e a função `Counter` **não** rodam de novo.

## 4. Props como getters

**Entrada (no pai):**

```tsx
<Counter label={title} start={10} />
```

**Saída:**

```js
Counter({
  get label() { return title.get() },   // dinâmico vira getter
  start: 10,                            // estático vira valor simples
})
```

O filho recebe uma função de leitura lazy. Mudar `title` no pai **não executa** `Counter`: só re-executa o `text(_a, ...)` dentro dele, se existir. Se o filho não ler `label`, nada acontece.

## 5. Condicionais

```tsx
{user ? <Profile user={user} /> : <Login />}
```

vira

```js
const _cond = computed(() => !!user.get())             // guard: só muda quando inverte
insert(_parent, () => _cond.get()
  ? Profile({ get user() { return user.get() } })
  : Login(), _marker)
```

Mudar de um `user` para outro **não** recria o `<Profile>`: a prop getter propaga o novo valor.

## 6. Listas

```tsx
{todos.map(todo => <li>{todo.text}</li>)}
```

vira

```js
list(_parent, () => todos.get(), (todo) => {
  const _li = _t1()
  text(_li.firstChild, () => todo.text)   // `todo` é proxy, então campo reativo
  return _li
}, /* key */ (todo) => todo, _marker)
```

`list` faz reconciliação **por chave** (move, insere e remove nós reais), sem diff de árvore.

## 7. Early return e `await`

Os dois usam o mesmo mecanismo: o corpo do componente é dividido em **setup** (roda uma vez) e **continuações** (rodam dentro de um owner próprio, ativadas por um ponto de decisão reativo).

- `if (cond) return X` → ponto de decisão `computed(() => !!cond)`. Ver [09-condicionais](09-condicionais.md).
- `const x = await expr` → ponto de decisão "recurso tem valor". Ver [11-async-no-componente](11-async-no-componente.md).

Em modo dev, o compilador também injeta metadados (`name`, `loc`) para o devtools ([12](12-devtools.md)).

## 8. Diagnósticos de compilação

O compilador deve emitir erros/avisos com localização e sugestão:

```
✖ src/Profile.tsx:12:3  jotastic/no-reactive-early-return
  Este `return` depende de `loading`, mas componentes executam só uma vez.
  Sugestão: mova a condição para o JSX:
    return loading ? <Spinner /> : <div>...</div>
```

Lista inicial de regras:
- `unsupported-return-position` (`return` em loop/`try` no corpo do componente; early returns normais são transformados, ver [09](09-condicionais.md))
- `continuation-state-resets` (hint: `let` após early return reseta quando o branch é recriado)
- `unsupported-await-position` (`await` dentro de `try` no corpo do componente, ver [11](11-async-no-componente.md))
- `prefer-key-in-list` (quando o item é primitivo)
- `watch-without-reads` (efeito que não lê nada reativo: provavelmente devia ser `onMount`)

## 9. Escolha de tecnologia

| Opção | Prós | Contras | Recomendação |
|---|---|---|---|
| **Babel plugin** | Maduro, escopo/bindings prontos (`path.scope`), muitos exemplos (Solid usa) | Mais lento | **MVP** |
| SWC plugin (Rust/WASM) | Rápido | Plugins instáveis entre versões, curva de Rust | Depois |
| oxc | Muito rápido, AST moderna | Ecossistema de transform ainda jovem | Avaliar pós-MVP |
| TS Compiler API | Tem tipos | Lento, API verbosa | Só se precisarmos de info de tipo |

> Observação: a análise **não** precisa de tipos do TypeScript. É puramente sintática/de escopo. Isso mantém o compilador rápido e simples.

## 10. Testes do compilador

- **Snapshot tests**: entrada `.tsx` e saída `.js` esperada, um caso por regra.
- **Testes de comportamento**: compila, executa em `happy-dom` e verifica o DOM e **quantas vezes** cada binding rodou (contador de execuções). Esse é o teste que prova "sem re-render desnecessário".
