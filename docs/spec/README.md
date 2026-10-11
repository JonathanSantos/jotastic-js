# Jotastic — Spec v1

> Status: **normativa** · 2026-10-11 · Consolida o refinamento ([docs/refinement](../refinement/README.md)) com as decisões D1–D46 e R1–R13 aplicadas.

Jotastic é uma biblioteca front-end **compiler-first**: você escreve componentes em TSX como se fossem funções TypeScript comuns, com a API do React que todo mundo já conhece (JSX, props, `children`, `onClick`), e o compilador gera a reatividade granular, a memoização e as atualizações do DOM. Sem hooks, sem Virtual DOM, sem arrays de dependência, sem re-render.

## Regra de ouro

> **O corpo de um componente (ou de uma função `use*`) roda uma vez, de cima para baixo, como JS.**
> **O que está no JSX, em `watch` ou em um `const` que lê estado é vivo.**
> **Reatribuir um `let` ou mutar um objeto é o que dispara a atualização.**

Tudo na biblioteca deriva dessas três frases. Uma regra nova que não caiba nelas é sinal de complexidade demais.

## Exemplo

```tsx
// main.tsx
import { mount } from 'jotastic'
mount(<UserPage id="42" />, '#app')

// UserPage.tsx
import { cart } from './stores/cart'

export async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)       // refaz quando `id` muda, cancela a anterior
  let editing = false                      // estado (sem useState)
  const initials = user.name[0]            // derivado (sem useMemo)

  return (
    <article>
      <span class="avatar">{initials}</span>
      <h1>{user.name}</h1>
      {editing && <EditForm user={user} />}
      <button onClick={() => (editing = !editing)}>Editar</button>   {/* sem useCallback */}
      <p>{cart.count} itens no carrinho</p>                           {/* store global, sem seletor */}
    </article>
  )
}
```

## Índice

| # | Documento | Conteúdo |
|---|---|---|
| 01 | [Modelo mental](01-modelo-mental.md) | Regra de ouro, tabela de uma página, o que muda vindo do React |
| 02 | [Componentes](02-componentes.md) | Definição, props, children, `<Slot>`, spread, `key`, `ref`, `mount`, composição |
| 03 | [Estado e derivados](03-estado-e-derivados.md) | `let`, `const`, objetos e proxy, `raw`, funções `use*` |
| 04 | [Efeitos e ciclo de vida](04-efeitos-e-ciclo-de-vida.md) | `watch`, `on`, `external`, `onMount`, `onCleanup`, `untrack`, `tick` |
| 05 | [JSX](05-jsx.md) | Atributos, `class`/`style`, eventos, formulários, diferenças do React |
| 06 | [Controle de fluxo](06-controle-de-fluxo.md) | Condicionais, early return, listas, owner tree |
| 07 | [Async](07-async.md) | `await` no componente, `<Boundary>`, `refresh`, cancelamento ambiente |
| 08 | [Store](08-store.md) | `createStore`, `set`, getters, ações async |
| 09 | [Erros](09-erros.md) | `<Boundary error>`, `onError`, o que é capturado |
| 10 | [Compilador](10-compilador.md) | Analyzer, classificação, transformações, saída, otimizações |
| 11 | [Runtime](11-runtime.md) | Primitivas, scheduler, proxy, `list`, `insert`, eventos, contratos |
| 12 | [Diagnósticos](12-diagnosticos.md) | Catálogo com ID, nível, gatilho e fix |
| 13 | [Tooling](13-tooling.md) | Vite, ESLint, `create`, HMR, devtools, testes |
| 14 | [Roadmap](14-roadmap.md) | Escopo do MVP, marcos, critérios de sucesso |
| 15 | [Decisões](15-decisoes.md) | Registro consolidado de todas as decisões e por quê |
| 16 | [Router](16-router.md) | Fase 2: desenho preliminar de `defineRoutes`, `<Outlet>`, `<Link>`, `useRoute` |
| 17 | [Contratos](17-contratos.md) | Índice dos `.d.ts` em [contracts/](contracts/), layout de módulos, scheduler, two-way, convenções de emissão |
| 18 | [Transformações](18-transformacoes.md) | Algoritmo do compilador, passo a passo, com tabelas de atributos e eventos |
| 19 | [Plano de testes](19-plano-de-testes.md) | Testes de contrato com asserções exatas, por marco |
| 20 | [Guia de implementação](20-guia-de-implementacao.md) | Ferramentas, ordem obrigatória, definição de pronto |
| — | [Saídas compiladas](compiled/README.md) | Seis arquivos compilados à mão: primeiros snapshots e primeiros testes do runtime |
| — | [Exemplos](examples/README.md) | O que o dev escreve: counter, todos, form, rotas, estilo, async, `use*`, store, libs externas, modal, tabs, React vs Jotastic |

## Os nove pilares

1. **Componente roda uma vez.** Atualizações acontecem por nó do DOM, nunca por re-execução.
2. **Reatividade granular via signals**, gerados pelo compilador a partir de `let`/`const`.
3. **Sem Virtual DOM.** Template clonado + bindings com referência direta ao nó real.
4. **Props são lazy** (getters): um filho só reage à prop que lê, no ponto exato onde lê.
5. **TSX válido.** Zero sintaxe nova; `tsc`, ESLint e o editor funcionam de fábrica.
6. **Reatribuição é rastreada pelo `let`; mutação, pelo objeto.** Reatribuir troca a referência (sem reconcile implícito).
7. **Lógica reutilizável é uma função `use*`** compilada com as mesmas regras do componente.
8. **O compilador verifica no editor** (analyzer compartilhado com o ESLint) e gera a burocracia.
9. **API funcional, sem opinião fora dela.** Classes, services e arquitetura do dev passam intactos.
