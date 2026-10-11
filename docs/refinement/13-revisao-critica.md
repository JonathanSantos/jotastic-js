# 13 — Revisão crítica

Uma releitura de tudo o que definimos, com três lentes: **simplicidade, DX e otimização**. Cada proposta tem um ID (R1, R2...) para ser aprovada ou recusada individualmente. Nada daqui foi aplicado nos outros documentos ainda.

---

## O que está certo e eu manteria sem mudar

| Decisão | Por quê |
|---|---|
| Componente roda uma vez + atualização por nó | É a tese central e a maior vantagem de performance e DX sobre o React |
| Sem VDOM, template clonado | Simples e rápido, e comprovado por Solid/Svelte 5 |
| Props como getters | Resolve "o filho só reage ao que lê" sem nenhuma API |
| TSX válido, sem sintaxe nova obrigatória | Tooling grátis. É o nosso diferencial em relação ao Svelte/Vue |
| Proxy profundo + reconcile | Deixa `todo.done = true` funcionar e protege contra objetos iguais |
| Early return reativo e `await` no componente | São os dois "uau" de DX que nenhuma outra lib oferece desse jeito |
| Store estilo Zustand | Familiar e sem Provider |

---

## O que eu faria diferente

### R1 — Uma "regra de ouro" única para o modelo mental

**Problema:** hoje o modelo mental está espalhado em vários documentos (o `let` copia o valor inicial, o `const` é derivado, o handler lê o valor atual, a continuação reseta...). Para quem chega, isso parece uma lista de exceções.

**Proposta:** toda a documentação deriva de **uma frase**:

> **"O corpo do componente roda uma vez. O que está no JSX, em `const` e em `watch` é vivo."**

Daí saem todas as regras: um `let` inicializado com uma prop copia o valor (o corpo roda uma vez); um `const` derivado acompanha a prop (é vivo); o handler lê o valor atual (lê o signal na hora). Essa frase deve abrir o tutorial e o README.

**Impacto:** DX ↑↑ · **Custo:** zero

---

### R2 — Cortar a superfície de API do MVP pela metade

**Problema:** somando tudo o que desenhamos, o MVP expõe ~30 APIs. Cada uma é algo a documentar, testar, manter e que o dev precisa aprender. Um MVP serve para validar a tese, não para ser completo.

**Proposta:**

| Fica no MVP (núcleo) | Adiado |
|---|---|
| `mount` | `createApp` (ver R3) |
| `watch`, `onMount`, `onCleanup` | `expose` |
| `untrack` | diretivas `use:` |
| `tick` (ver R11) | `keep:alive` (D14) |
| `createStore` | `raw` (só se o benchmark pedir) |
| `<Catch>`, `<Async>` | `batch` público (o batching já é automático) |
| `pending`, `refresh`, `abortSignal` | `$snapshot`, `$subscribe`, `persist` |
| JSX: `bind:`, `ref`, `key`, `class`/`style` objeto, `hidden` | `cached`, `transition:` |

Ficam ~12 APIs. Tudo o que foi adiado continua desenhado nos documentos, então o runtime nasce preparado para receber.

**Impacto:** simplicidade ↑↑, tempo até validar ↓ · **Custo:** zero (é só corte)

---

### R3 — Bootstrap com uma função só (funcional)

**Problema:** `createApp(<App />).use(x).onError(y).mount('#app')` é um builder encadeado, um padrão mais orientado a objetos, e são duas formas de fazer a mesma coisa (`mount` vs. `createApp`).

**Proposta:**

```tsx
mount(<App />, '#app')

mount(<App />, '#app', {
  plugins: [devtools(), router(routes)],
  onError: (err, info) => report(err),
})
```

Uma função, um objeto de opções, que retorna `unmount`. Plugins são funções `(app) => void`.

**Impacto:** simplicidade ↑, alinhado ao princípio funcional · **Custo:** zero

---

### R4 — Async: remover o `Componente.pending = ...`

**Problema:** definimos 3 lugares para declarar loading/erro. O nível (b), propriedade estática (`UserPage.pending = () => ...`), é uma mutação da função, foge do estilo funcional e cria uma regra de prioridade que o dev precisa decorar.

**Proposta:** só dois lugares:
- props `pending`/`error` no uso (`<UserPage pending={...} />`);
- boundary `<Async>` para uma subárvore.

Quem quer um "skeleton padrão" cria um wrapper: `const UserPageWithSkeleton = (p) => <UserPage {...p} pending={<Skeleton />} />`.

**Impacto:** simplicidade ↑ · **Custo:** zero

---

### R5 — `const` com efeito colateral não pode virar derivado

**Problema real:** pela regra atual, isto é recriado a cada mudança de `data`:

```tsx
const chart = new Chart(canvas, data)    // lê `data` (prop), então vira computed
```

Isso cria um `Chart` novo a cada atualização, um bug silencioso e caro.

**Proposta:**
1. `const x = new ...` **nunca** vira derivado (roda uma vez, como o corpo).
2. Derivados são **lazy**: se ninguém lê `x` em um contexto vivo (JSX/`watch`/outro derivado), ele roda só uma vez.
3. Aviso em dev: se um derivado recalcula e devolve uma **instância de classe** (não um objeto plain), avisar ("`chart` está sendo recriado a cada mudança de `data`; use `onMount` ou `untrack`").

**Impacto:** DX ↑ (evita a pior armadilha do modelo) · **Custo:** baixo

---

### R6 — `.map` com JSX fora do JSX também vira lista

**Problema:**

```tsx
const rows = items.map(i => <Row item={i} />)   // derivado que devolve um array de nós novos
return <table>{rows}</table>
```

Como derivado comum, isso **recria todas as linhas** a cada mudança em `items`.

**Proposta:** o compilador reconhece `const x = expr.map(item => JSX)` e aplica a mesma transformação de lista com chave do JSX. O dev pode extrair pedaços de JSX para variáveis sem perder performance.

**Impacto:** DX ↑, otimização ↑ · **Custo:** baixo

---

### R7 — Estado do store é somente leitura fora das ações

**Problema:** com proxy profundo, um componente poderia fazer `cart.items.push(x)` direto, sem passar por `set`. Teríamos então dois caminhos para mudar o store, o histórico do devtools ficaria incompleto e seria difícil achar "quem mudou isso".

**Proposta (fiel ao Zustand):**
- Fora das ações, o tipo do estado é `DeepReadonly` (o TS dá erro ao tentar mutar).
- Em dev, uma mutação direta via proxy lança um aviso com o arquivo e a linha.
- `set` com uma única assinatura: `set(parcial | (state) => parcial | void)`. Se a função retornar um objeto, faz merge; se não retornar nada, as mutações feitas no `state` valem (estilo Immer). É uma regra só, em vez de "três formas".

O `let` local do componente continua livre para mutar: o escopo é pequeno e visível.

**Impacto:** previsibilidade ↑, devtools 100% confiável · **Custo:** baixo

---

### R8 — Instâncias de classe nunca recebem proxy (consequência do princípio funcional)

**Problema:** se o dev guarda um service em estado (`let api = new UserService()`), envolver a instância em proxy **quebra campos privados `#x`** (o JS lança `TypeError` quando um Proxy acessa um campo privado) e muda a identidade do objeto.

**Proposta:** só **objetos plain e arrays** recebem proxy e reconcile. Instâncias de classe, `Map`, `Set`, `Date`, elementos DOM e `File` passam **intactos**, comparados por referência. Isso formaliza o "não opinamos fora da nossa API": a camada de services do dev funciona exatamente como funcionaria sem a lib.

> `Map`/`Set` reativos podem vir depois como opt-in (`reactiveMap()`), se houver demanda.

**Impacto:** compatibilidade ↑, zero surpresas · **Custo:** zero (simplifica o runtime)

---

### R9 — Meta de tamanho realista, com "pague pelo que usa"

**Problema:** a meta de "< 5 KB" foi definida antes de incluirmos reconcile, async, store e early return. Com tudo, o realista é ~7–9 KB.

**Proposta:** como o compilador sabe o que cada arquivo usa, ele importa **só os helpers necessários** (`list`, `branches`, `resource`, `reconcile` são módulos separados). Metas:

| Cenário | Meta (gzip) |
|---|---|
| Hello world / counter | < 3 KB |
| TodoMVC | < 6 KB |
| Todas as features | < 10 KB |
| Comparação: React + ReactDOM | ~45 KB |

**Impacto:** otimização ↑ e uma meta honesta para o benchmark · **Custo:** organização do runtime desde o M1

---

### R10 — HMR preservando estado antes do previsto

**Problema:** marcamos "HMR com estado" como pós-MVP, mas, como o foco é DX, perder o estado a cada save é o que o dev mais sente no dia a dia.

**Oportunidade:** o compilador conhece **cada `let` por nome**. No hot reload, o runtime pode transferir os valores das variáveis com o mesmo nome e o mesmo tipo da instância antiga para a nova. Isso é mais simples que o Fast Refresh do React, que depende da ordem dos hooks.

**Proposta:** HMR com estado entra no **M6 (DX)**.

**Impacto:** DX ↑↑ (é a feature que o dev percebe a cada save) · **Custo:** médio

---

### R11 — `tick()` para "esperar o DOM atualizar"

**Problema:** com batching em microtask, este código falha:

```tsx
function startEdit() {
  editing = true
  input.focus()          // o <input> ainda não existe: o DOM só atualiza no microtask
}
```

O React tem o mesmo problema (`flushSync`).

**Proposta:** `await tick()`, que espera o flush:

```tsx
async function startEdit() {
  editing = true
  await tick()
  input.focus()
}
```

Para o caso mais comum, o atributo nativo `autofocus` em um elemento que acabou de ser criado já funciona (o runtime chama `.focus()` ao inserir).

**Impacto:** DX ↑ · **Custo:** baixo

---

### R12 — Demo da tese mais cedo

**Problema:** o painel que **prova visualmente** "só o necessário atualiza" (overlay de flash) está no M6. Até lá não temos como mostrar a ideia para ninguém.

**Proposta:** mover o overlay de flash + contador de execuções para logo depois do **M3**. Ele é pequeno (o runtime emite eventos e o overlay desenha retângulos) e serve como ferramenta de debug para nós mesmos durante o M4–M5.

**Impacto:** validação mais cedo · **Custo:** baixo

---

### R13 — Eventos delegados precisam se comportar como os nativos

**Problema conhecido do Solid:** com delegação, `e.stopPropagation()` e `e.currentTarget` não funcionam como o dev espera se a lib não emular a propagação corretamente, e misturar listeners nativos com delegados gera ordens estranhas.

**Proposta:** testes de contrato para `currentTarget`, `stopPropagation`, ordem de bubbling e eventos dentro de Shadow DOM. Se ficar complexo demais, eventos **não delegados por padrão** são uma opção válida (mais memória, zero surpresa). A decisão fica para o M3, com benchmark.

**Impacto:** zero surpresas · **Custo:** baixo/médio

---

## Resumo

| ID | Proposta | Lente | Custo |
|---|---|---|---|
| R1 | Regra de ouro única | DX | zero |
| R2 | Cortar a API do MVP para ~12 itens | Simplicidade | zero |
| R3 | `mount(app, alvo, opções)` no lugar de `createApp` | Simplicidade/funcional | zero |
| R4 | Async: só props + `<Async>` | Simplicidade | zero |
| R5 | `new` e efeitos colaterais não viram derivado | DX | baixo |
| R6 | `.map` com JSX em `const` vira lista | Otimização | baixo |
| R7 | Store somente leitura fora das ações, `set` com uma assinatura | Previsibilidade | baixo |
| R8 | Sem proxy em instâncias de classe | Funcional/compatibilidade | zero |
| R9 | Metas de tamanho realistas + imports sob demanda | Otimização | baixo |
| R10 | HMR com estado no M6 | DX | médio |
| R11 | `tick()` | DX | baixo |
| R12 | Overlay de flash depois do M3 | Validação | baixo |
| R13 | Contrato de eventos delegados | DX | baixo/médio |
