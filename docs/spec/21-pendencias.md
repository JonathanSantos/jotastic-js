# 21 — Pendências

Lacunas e conflitos encontrados durante a implementação, com o caso concreto e o que foi feito por ora. Cada item precisa de decisão; até lá vale a solução provisória descrita.

## Tipos (jsx.d.ts / jotastic.d.ts)

| # | Caso concreto | Provisório |
|---|---|---|
| T-1 | `JSX.Element = Node \| Node[] \| …` rejeita filhos mistos: `<p>{count} (dobro: {double})</p>`, `{items.map(...)}` (TS2322) | `Element[]` recursivo no lugar de `Node[]` |
| T-2 | `on${Capitalize<K>}` gera `onDblclick`/`onKeydown`; 05-jsx e exemplos usam `onDblClick`/`onKeyDown` | tabela `CamelEventNames` para eventos compostos |
| T-3 | `EventHandler` usa `target: Element`, que dentro de `namespace JSX` resolve para `JSX.Element` | `globalThis.Element` |
| T-4 | `createStore((set, get) => ({ n: 1, inc: () => set(s => ({ n: s.n + 1 })) }))` não infere `S` (fica `object`); 05-styling e 08-store não compilam como escritos | contrato mantido; cópias de teste usam `createStore<State>(…)`. Decidir: exemplos com tipo explícito ou outra assinatura (curried à la zustand) |
| T-5 | `Slots<N>` tipa slot como `JSX.Element \| SlotFn`; `slots.row(item)` (13-slots:28) não é chamável porque `JSX.Element` inclui string | cast `(slots.row as SlotFn)`. Sugestão: declarar quais slots são funções |
| T-6 | `EventMapOf` não exportado no contrato | exportado |

## Exemplos com erro de tipo próprio (contornados em `packages/jotastic/test/types/patched/`)

- 05-styling:78 `interface … extends JSX.IntrinsicElements['button']` (TS2499) → `type … &`.
- 05-styling:64 `title={c.v}` com `number`, contrato pede `string`.
- 06-async:2/93 `import { api }` conflita com `declare const api` (TS2440).
- 06-async:18,27 e 10-modal:56: erro `unknown` usado como `Error` (`e.message`).

## Núcleo reativo (passo 1)

| # | Caso concreto | Provisório |
|---|---|---|
| N-1 | Ordem do flush: efeito user que agenda um de render | sempre roda o render de menor id antes de voltar à fila user (refina "render inteira, depois user, repetindo"; R13 ok) |
| N-2 | `effect-loop` na 101ª execução | vai para `handleError(owner, err, 'effect')`; efeito volta a CLEAN, segue assinado; `flush()` não lança |
| N-3 | `use-outside-owner` em dev: lançar ou não? | `handleError(null, …)` (console.error / relança em teste); o efeito é criado |
| N-4 | `onCleanup` dentro de `watch` | registra no owner (não no efeito): acumula a cada reexecução. Decidir se efeito deve ser escopo de cleanup |
| N-5 | Efeitos/memos criados dentro de um efeito | pertencem ao owner do efeito pai e acumulam em reexecuções; só branch/item/continuação criam owners próprios |
| N-6 | Memo com erro | erro guardado e relançado em cada `get()`; recupera quando a fonte muda |
| N-7 | `handleError` | usa o `onError` do ancestral mais próximo; se `boundary.catch` lançar, sobe; erro em cleanup usa fase `'effect'` |
