# Jotastic — Refinamento

> Status: **histórico**. A spec normativa está em [docs/spec](../spec/README.md) (2026-10-11). Estes documentos registram a discussão e as decisões que levaram a ela; onde divergirem, vale a spec.

Jotastic é uma lib front-end **compiler-first** que usa TSX como sintaxe padrão, sem Virtual DOM e sem hooks. O desenvolvedor escreve TypeScript "normal" (`let`, `const`, funções, JSX) e o compilador transforma isso em código reativo, granular e otimizado.

## Pitch em uma frase

> "Escreva componentes como se fossem funções TypeScript comuns. O compilador cuida da reatividade, da memoização e das atualizações do DOM."

## Exemplo rápido

```tsx
// main.tsx
import { mount } from 'jotastic'
mount(<UserPage id="42" />, '#app')

// UserPage.tsx
export async function UserPage({ id }: { id: string }) {
  const user = await api.getUser(id)      // refaz quando `id` muda, cancela a anterior
  let editing = false                     // estado (sem useState)
  const initials = user.name[0]           // derivado (sem useMemo)

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
|---|-----------|----------|
| 01 | [Visão e princípios](01-visao-e-principios.md) | Problema, princípios, o que muda em relação ao React |
| 02 | [API do desenvolvedor](02-api-do-desenvolvedor.md) | Estado, derivados, efeitos, props, listas, eventos |
| 03 | [Compilador](03-compilador.md) | Regras de transformação, entrada/saída, diagnósticos |
| 04 | [Runtime](04-runtime.md) | Signals, guards, **proteção por valor em objetos**, binding no DOM |
| 05 | [Escopo do MVP](05-escopo-mvp.md) | O que entra, marcos M0–M8, critérios de sucesso |
| 06 | [Decisões e dúvidas](06-duvidas-em-aberto.md) | O que já foi decidido e o que falta decidir |
| 07 | [Ideias de inovação](07-ideias-de-inovacao.md) | Promovidas, descartadas e em avaliação |
| 08 | [Bootstrap e componentes](08-bootstrap-e-componentes.md) | `mount`/`createApp`, anatomia, composição, exemplo de tela |
| 09 | [Condicionais](09-condicionais.md) | Remover e reinserir no DOM, `hidden`, early return reativo |
| 10 | [Store](10-store.md) | Mini Zustand reativo, sem seletores |
| 11 | [Async no componente](11-async-no-componente.md) | `await` direto, pending/erro, recarga, cancelamento |
| 12 | [Devtools](12-devtools.md) | Painel de debug embutido (estilo React Query Devtools) |
| 13 | [Revisão crítica](13-revisao-critica.md) | Propostas R1–R13 de simplificação, DX e otimização |
| 14 | [Pesquisa de frameworks](14-pesquisa-frameworks.md) | React, Vue, Angular, Svelte, Solid: como lidam com os nossos cenários |
| 15 | [Tema 1: modelo mental](15-tema-01-modelo-mental.md) | ✅ Fechado: regra de ouro, `let`/`const`, `external`, `on`, `watch` |
| 16 | [Revisão estratégica](16-revisao-estrategica.md) | 🟡 Proposta: D24–D46, contrato do compilador, catálogo de diagnósticos, otimizações, plano de execução |

## Decisões principais

1. **O componente roda uma única vez** (setup). As atualizações acontecem por nó do DOM, nunca por re-execução.
2. **Reatividade granular via signals**, gerados pelo compilador a partir de `let`/`const`.
3. **Sem Virtual DOM**: template clonado + bindings com referência direta ao nó real.
4. **Props são lazy** (getters): um filho só reage à prop que lê, no ponto exato onde lê.
5. **TSX válido**: zero sintaxe obrigatória nova; o editor e o `tsc` funcionam de fábrica.
6. **Guards em 3 camadas**: `Object.is` por propriedade, reconcile profundo na substituição de objetos (com custo proporcional ao que é lido) e comparação rasa em derivados. Tudo com batching. ⚠️ *Em revisão: a [16](16-revisao-estrategica.md#21-reconcile-automático-quebra-o-js-d24) propõe reconcile opt-in (D24).*
7. **Proxy profundo** para objetos/arrays; **`createStore`** (mini Zustand sem seletores) para estado compartilhado.
8. **Early return reativo** e **`await` no componente** transformados pelo compilador.
9. **API funcional, sem opinião fora dela**: classes, services e arquitetura do dev passam intactos.
