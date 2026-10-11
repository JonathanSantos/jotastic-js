# 06 — Decisões e dúvidas em aberto

## Princípios decididos

- **API funcional, sem opinião fora dela.** Tudo o que expomos são funções e componentes-função. O que o dev faz fora da nossa API (services com classes, arquitetura) é decisão dele. ([01](01-visao-e-principios.md))
- **Foco: simplicidade, DX e otimização**, nessa ordem de desempate.

## Decididas

| # | Tema | Decisão | Detalhes |
|---|---|---|---|
| D1 | Estado fora de componentes | `let` reativo **só dentro de componentes**; estado compartilhado via `createStore` | [10-store](10-store.md) |
| D2 | Objetos e arrays | **Proxy profundo e lazy**, com proteção por valor (reconcile) | [04-runtime](04-runtime.md) |
| D3 | Estado global | `createStore` em módulo no MVP; stores com escopo depois | [10-store](10-store.md) |
| D5 | Early return | **Condição reativa já no MVP** | [09-condicionais](09-condicionais.md) |
| D11 | `await` independentes | **Adiada.** `await` segue a semântica normal do JS (sequencial); paralelizar é explícito com `Promise.all`. Revisitar depois, talvez como aviso do compilador | [11-async](11-async-no-componente.md) |
| D13 | Estado de continuação | **Reseta** quando o branch é recriado, com o aviso `continuation-state-resets` do compilador | [09-condicionais](09-condicionais.md) |
| D14 | `keep:alive` | **Fora do MVP.** O `hidden` nativo cobre a maioria dos casos; o owner tree nasce preparado para pausar | [09-condicionais](09-condicionais.md) |
| D15 | API do store | **Somente estilo Zustand** (`createStore((set, get) => ...)`) | [10-store](10-store.md) |
| T1 | Modelo mental | Regra de ouro; `let` = estado; `const` derivado (inclusive `new`); `external` + `on`; `watch` explícito com correção automática; leitura síncrona; limite de loop = 100 | [15](15-tema-01-modelo-mental.md) |
| — | Modelo de execução | Componente roda uma vez; atualização por nó | [01](01-visao-e-principios.md) |
| — | Sem VDOM | Template clonado + bindings diretos nos nós | [03](03-compilador.md) |
| — | Igualdade | 3 camadas: folha, reconcile em substituição, comparação rasa em derivados | [04-runtime](04-runtime.md) |
| — | Escopo de ideias | Sem geração de telas/CRUD por CLI | [07](07-ideias-de-inovacao.md) |

---

## Fila de discussão (uma por vez)

Ordem sugerida: das bases do modelo mental para as features. Cada item cita a pesquisa ([14](14-pesquisa-frameworks.md)).

| # | Tema | Itens relacionados |
|---|---|---|
| 1 | ✅ **Modelo mental e regras do compilador** (fechado → [15](15-tema-01-modelo-mental.md)) | R1, R5, D6, D16, D17 |
| 2–10 | 🟡 Decisões propostas em [16 §3](16-revisao-estrategica.md#3-decisões-propostas-para-a-fila-de-temas-06) (D29–D46) | — |
| 2 | **Props e two-way**: passar prop para função externa, derivado gravável, `bind:` em componentes | D18, D19 |
| 3 | **Objetos e classes**: proxy só em POJO/array, `raw`, Map/Set | R8 |
| 4 | **Condicionais e `hidden`**: efeitos em conteúdo oculto, `onHide`/`onShow` | D20 |
| 5 | **Eventos**: delegação ou listeners diretos | R13 |
| 6 | **Store**: readonly + draft, ações async, persist | R7 |
| 7 | **Async**: `try/catch`, consistência ao recarregar, aviso de waterfall | D21, D22 |
| 8 | **Bootstrap e superfície de API do MVP** | R2, R3, R4 |
| 9 | **Erros**: boundary que captura handlers e efeitos | D23 |
| 10 | **Tooling**: HMR, tamanho, devtools | R9, R10, R12 |

## Aguardando aprovação

- As propostas **R1–R13** da [revisão crítica](13-revisao-critica.md), com os ajustes da [pesquisa](14-pesquisa-frameworks.md).
- As decisões **D24–D46** da [revisão estratégica](16-revisao-estrategica.md), que cobrem a fila de temas 2–10 acima e revisam D2 (reconcile) e o item "lógica reutilizável" de [02](02-api-do-desenvolvedor.md).

## Em aberto

### D7 — `class` ou `className`?

**Recomendação:** `class` e `for`; aceitar `className` como alias com aviso.

### D8 — Interop com React

**Recomendação:** fora do MVP.

### D9 — Nome, licença e público-alvo

- O nome é **Jotastic**? (verificar no npm)
- Licença MIT?
- Público inicial?

### D18 — Derivado gravável ("estado local que reseta quando a prop muda")

Demanda recorrente (`linkedSignal`, `$derived` sobrescrevível). Como expressar sem API nova?

### D19 — `bind:` em componentes precisa de opt-in no filho?

Svelte 5 (`$bindable`) e Angular (`model()`) exigem.

### D20 — O que acontece com efeitos de conteúdo oculto com `hidden`?

Continuam rodando? Oferecemos `onHide`/`onShow`?

### D21 — `try/catch` em volta de `await` de componente

A pesquisa sugere permitir (vantagem sobre `use()` do React).

### D22 — Consistência ao recarregar async

Quando `id` muda, o resto da UI que lê `id` atualiza na hora (enquanto `user` ainda é o antigo) ou espera junto?

### D23 — Error boundary captura erros de handlers e efeitos?

React e Svelte não capturam. Nós podemos, via owner.

### D12 — `cached()` no MVP?

**Recomendação:** depois do M7; o `resource` já nasce compatível.
