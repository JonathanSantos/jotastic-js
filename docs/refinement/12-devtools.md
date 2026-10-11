# 12 — Devtools: toolkit de debug embutido

Inspirado no React Query Devtools: um **painel flutuante dentro da própria página**, sem extensão de navegador, que só existe em modo dev.

## Instalação

```tsx
import { createApp } from 'jotastic'
import { devtools } from '@jotastic/devtools'

createApp(<App />).use(devtools()).mount('#app')
```

Ou automático via plugin Vite (`jotastic({ devtools: true })`). Em build de produção o pacote é removido (tree-shaking + flag `import.meta.env.DEV`), com custo zero.

Atalho: `Alt+J` abre e fecha. Um botão flutuante no canto mostra o logo e um contador de atualizações.

---

## Painéis

### 1. Componentes (árvore de owners)

```
▾ App                                   App.tsx:5
  ▾ TodoPage                            pages/TodoPage.tsx:4
      draft: "comprar pão"     ✎
    ▾ branch (todos.visible.length > 0) ✓ ativo
      ▾ list (todos.visible) · 12 itens
          li#a1f…  done: false
          li#b2c…  done: true
  ▸ Editor  ⏸ keep:alive (pausado)
```

- Mostra estado local (`let`), derivados e props de cada instância.
- **Editar valores ao vivo** (✎) dispara a atualização real.
- Clicar em um nó destaca o elemento na página (e vice-versa, com o modo "inspecionar").
- Indica branches ativos e inativos, `keep:alive` pausados e recursos async pendentes.

### 2. Stores

```
cart                         stores/cart.ts
  items: Array(3)            ▸
  coupon: null
  count: 5         (getter)
  total: 189.90    (getter)
  ── ações ──
  12:03:41.220  add({ id: 'p7' })     items[2].qty: 1 → 2
  12:03:39.101  applyCoupon('PROMO')  coupon: null → 'PROMO'
```

- Histórico de ações com **diff do que mudou** (só os campos que o reconcile realmente alterou).
- **Time travel**: clicar numa ação volta o store para aquele ponto.
- Botões: `$reset`, copiar `$snapshot` como JSON, importar estado.

### 3. Async (o "React Query" do painel)

| Recurso | Componente | Status | Deps | Duração | Ações |
|---|---|---|---|---|---|
| `api.getUser(id)` | UserPage | 🟢 sucesso | `id = "42"` | 120 ms | refetch · invalidar |
| `api.getPosts(user.id)` | UserPage | 🟡 recarregando | `user.id = 42` | — | cancelar |
| `['user', 7]` (cached) | 3 assinantes | ⚪ stale | — | 98 ms | refetch |

- Dados retornados (inspecionáveis), erro com stack e timeline de execuções.
- **Simular**: forçar loading infinito, forçar erro, adicionar latência. Ótimo para testar `pending`/`error` sem mexer no backend.

### 4. Atualizações ("por que isso mudou?")

Timeline de cada flush:

```
#128  12:03:41.220  ação cart.add          2 signals · 3 bindings · 0.4 ms
      cart.items[2].qty  1 → 2
        └─ computed cart.count  4 → 5
             └─ text  CartBadge.tsx:7  "4" → "5"
        └─ computed cart.total  169.90 → 189.90
             └─ text  CartSummary.tsx:12
      ✂ computed cart.isEmpty  false → false   (igual, propagação cortada)
```

- Mostra a cadeia **causa → derivados → nós do DOM**, com arquivo e linha.
- Mostra também o que foi **evitado** pelos guards (✂), o que ajuda a provar a proposta da lib.
- **Overlay de flash**: cada nó atualizado pisca na página (liga/desliga).

### 5. Performance

- Contadores por componente: quantos bindings, quantas execuções e tempo total.
- Alertas: "o binding X rodou 300 vezes em 1 s", "computed Y nunca é lido", "`let` Z nunca muda (poderia ser `const`)".

---

## Como funciona

### O compilador injeta metadados (só em dev)

```js
// dev
const count = signal(0, { name: 'count', loc: 'Counter.tsx:3:7', owner: _o })
text(_b, () => count.get(), { loc: 'Counter.tsx:12:15' })

// prod
const count = signal(0)
text(_b, () => count.get())
```

### O runtime expõe um hook global

```ts
globalThis.__JOTASTIC_DEVTOOLS__?.emit({ type: 'set', node, prev, next })
```

Eventos: `owner:create/dispose`, `signal:set`, `computed:run/skip`, `effect:run`, `dom:write`, `resource:*`, `store:action`. Em produção o hook não existe e as chamadas são removidas pelo compilador.

### UI do devtools

Feita **com o próprio Jotastic**. Isso serve de dogfooding: se o painel for agradável de construir, é um bom sinal para a lib. Ela roda em um **Shadow DOM** isolado (sem conflito de CSS) e com um root separado, e ignora seus próprios eventos para não poluir os dados.

---

## Escopo por fase

| Fase | Entrega |
|---|---|
| **MVP-lite** (junto com M5) | Metadados do compilador + painel **Atualizações** + overlay de flash. É o que mais ajuda a validar e demonstrar a ideia. |
| Fase 2 | Componentes (com edição ao vivo) + Stores (histórico de ações) |
| Fase 3 | Async (com simulação) + Performance + time travel |
| Futuro | Extensão de navegador e integração com o editor ("abrir no VS Code" pelo `loc`) |
