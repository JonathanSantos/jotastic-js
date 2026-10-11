# Saídas compiladas à mão

Cada arquivo é o JS que o compilador DEVE emitir (modo **dev**, legível) para o exemplo correspondente, escrito à mão contra os contratos de [contracts/runtime.d.ts](../contracts/runtime.d.ts). São os primeiros snapshots do compilador e os primeiros testes do runtime (M1): o runtime tem que executar estes arquivos antes de existir compilador.

| Arquivo | Entrada | Cobre |
|---|---|---|
| [01-counter.js](01-counter.js) | examples/01-counter.tsx | signal, memo, props, eventos, classList, bool, template, insert, mount |
| [02-todos.js](02-todos.js) | examples/02-todos.tsx | state, list, branches, two-way, stateLiteral-free, `on`, reatribuição de array |
| [03-use-fetch.js](03-use-fetch.js) | examples/07-use-functions.ts (`useFetch`, `useMediaQuery`) | funções `use*`: params lazy, retorno com getters/setters, `on` lazy |
| [04-user-page.js](04-user-page.js) | spec 06 (early return com `useFetch`) | branches a partir de early return, continuação, estado da continuação |
| [05-async-user-card.js](05-async-user-card.js) | examples/06-async.tsx (`UserCard`, `Sidebar`) | resource, continuation, `pending`/`refresh`, Boundary |
| [06-slots-card.js](06-slots-card.js) | spec 02 (`Card` com slots) | objeto de slots, slot com parâmetro, slot condicional |

Convenções de emissão (dev):
- Imports nomeados de `jotastic/runtime`, um por helper usado.
- Templates hoisted no topo do módulo como `_t0`, `_t1`…; nós resolvidos uma vez por instância como `_a`, `_b`… via `firstChild`/`nextSibling`.
- `signal`/`state`/`memo`/`effect` recebem `{ name, loc }` em dev; em prod o compilador omite o argumento.
- Props estáticas são valores; dinâmicas são getters.
