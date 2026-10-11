# 07 — Ideias de inovação

## Promovidas para o roadmap

| Ideia | Status | Documento |
|---|---|---|
| `await` direto no componente | M7 | [11-async-no-componente](11-async-no-componente.md) |
| Early return reativo | MVP (M4) | [09-condicionais](09-condicionais.md) |
| Grafo de reatividade / debug | MVP-lite + fases | [12-devtools](12-devtools.md) |

## Descartadas

- ~~Geração de telas/CRUD por CLI a partir de schema~~: "gerar telas" significa o dev construir as telas usando a lib, não scaffolding automático.

---

## Em avaliação (pós-MVP)

### I3 — CSS com escopo no próprio TSX

```tsx
export function Button({ children }: ParentProps) {
  return <button class="btn">{children}</button>
}

Button.css = css`
  .btn { padding: 8px 16px; border-radius: 8px; }
  .btn:hover { background: var(--hover); }
`
```

Extraído em build para um `.css` com classes com hash. Zero runtime. Valores reativos (`color: ${color}`) viram CSS custom properties atualizadas por binding.

**Impacto:** alto · **Esforço:** médio

### I5 — Formulários de primeira classe

```tsx
const form = createForm<User>({ name: '', email: '' })

<input bind:value={form.name} required minLength={3} />
{form.errors.name && <span>{form.errors.name}</span>}
<button disabled={!form.valid}>Salvar</button>
```

Validação derivada dos atributos HTML, com `dirty/touched/errors` derivados automaticamente.

**Impacto:** alto · **Esforço:** médio

### I6 — Router tipado

```
src/pages/
├─ index.tsx
├─ users/[id].tsx       → props: { id: string }
```

`<Link to="/users/:id" params={{ id }} />` com erro de tipo se a rota não existe. Combina com `await` no componente para carregar dados da página.

**Impacto:** alto (toda app com várias telas precisa) · **Esforço:** médio

### I7 — Transições declarativas

```tsx
{open && <Modal transition:out={fadeOut} />}
{todos.map(t => <li animate:flip>{t.text}</li>)}
```

O runtime controla a remoção de nós reais, então segurar a saída até a animação acabar é natural. ([09 §11](09-condicionais.md))

**Impacto:** médio · **Esforço:** médio

### I8 — Componentes estáticos viram HTML / SSR com ilhas

Componentes sem nada dinâmico viram só template. Com SSR, só o que é reativo carrega JS.

**Impacto:** alto · **Esforço:** alto

### I9 — Erros pensados para humanos (e para IA)

Mensagens estilo Elm/Rust com auto-fix (LSP code actions). Facilita tanto o dev quanto agentes de IA escrevendo código Jotastic.

**Impacto:** médio/alto · **Esforço:** baixo, contínuo

### I11 — Testar lógica sem DOM

```ts
const c = instantiate(Counter, { label: 'x' })
c.state.count = 5
expect(c.state.double).toBe(10)
```

**Impacto:** médio · **Esforço:** baixo/médio

### I12 — Diretivas `use:` reutilizáveis

`use:clickOutside`, `use:autofocus`, `use:intersect`... uma pequena biblioteca oficial de diretivas. ([08](08-bootstrap-e-componentes.md))

**Impacto:** médio · **Esforço:** baixo

## Priorização sugerida pós-MVP

1. **I6** (router): necessário para apps com várias telas
2. **I5** (forms)
3. **I3** (CSS com escopo)
4. **I9** (erros/auto-fix), de forma contínua
5. **I7**, **I12**, **I11**
6. **I8** (SSR/ilhas)
