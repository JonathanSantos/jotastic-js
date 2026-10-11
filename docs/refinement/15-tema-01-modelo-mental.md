# 15 — Tema 1 (fechado): modelo mental e regras do compilador

> Status: **fechado** em 2026-10-11 · Base: pesquisa [14](14-pesquisa-frameworks.md) · Substitui R1, R5, D6, D16 e D17

## 1.1 — Regra de ouro

> **"O corpo do componente roda uma vez. O que está no JSX, em `watch` ou em um `const` que lê estado é vivo."**

Toda a documentação deriva desta frase. Uma regra nova que não caiba nela é sinal de complexidade demais.

## 1.2 — `let` é estado

- Todo `let` no **escopo raiz** do componente é estado (a otimização de `let` nunca reatribuído é invisível para o dev).
- Um `let` dentro de funções, handlers, loops ou blocos é JS normal.
- O inicializador é lido **uma vez** (é uma cópia): `let draft = value` não acompanha `value`.

## 1.3 — `const` e integração com o mundo externo

### Quando um `const` é derivado

| `const x = ...` | Comportamento |
|---|---|
| Expressão que lê estado, prop, derivado ou store (inclusive `new`) | **Derivado** lazy e memoizado |
| Chamada de função | **Derivado candidato**: na primeira execução, o runtime vê se algo reativo foi lido; se nada foi lido, vira constante sem custo |
| Função/arrow | Constante (estável) |
| JSX | Constante; os bindings internos são vivos |
| `items.map(i => JSX)` | Lista com chave (R6) |
| `await ...` | Recurso async (tema 7) |
| Sem nada reativo | Constante |

> A exceção "`new` nunca é derivado" foi **descartada**: `new Intl.NumberFormat(locale)` deve acompanhar `locale`. Libs com ciclo de vida usam `external`.

### `external(create, update?, destroy?)`

Primitiva para libs e objetos com ciclo de vida (Chart.js, Leaflet, Monaco, WebSocket, observers...).

- `create` roda **depois de montar**, então os refs já existem.
- **Regra: com `update`, nunca recria. Sem `update`, recria quando algo lido no `create` muda.**
- **Destruição automática** no unmount e na recriação, chamando o primeiro método que existir: `[Symbol.dispose]`, `destroy`, `dispose`, `disconnect`, `close`, `unsubscribe`, `abort`.
- O terceiro argumento `destroy` sobrescreve a escolha automática.
- O devtools mostra qual método de destruição foi chamado.

```tsx
// Lib ligada a elemento: atualiza sem recriar
let canvas!: HTMLCanvasElement
const chart = external(
  () => new Chart(canvas, { type: 'bar', data }),
  (chart) => { chart.data = data; chart.update() },
)

// Recria quando a dependência muda (fecha o anterior)
const socket = external(() => new WebSocket(`/rooms/${roomId}`))

// Destruição customizada
const map = external(() => L.map(el), undefined, (m) => m.remove())
```

### `on(alvo, evento, handler, opções?)`

Listener em `window`/`document`/qualquer `EventTarget`, removido automaticamente no unmount. Entra no **núcleo**.

```tsx
on(window, 'resize', () => (width = window.innerWidth))
on(document, 'keydown', e => e.key === 'Escape' && close())
```

### Ajudas do compilador

- **Erro:** ref usado no corpo antes de montar → sugere `external`.
- **Aviso (dev):** um `const` derivado que recria uma instância de classe a cada mudança → sugere `external` com `update`.

## 1.4 — Closures leem o valor atual

Handlers e callbacks sempre leem o valor **atual** (sem stale closures). Para congelar um valor, basta um `const` local dentro do handler.

## 1.5 — Leitura síncrona

`count++; console.log(count)` imprime o valor novo, e derivados lidos em seguida também já estão atualizados. Só o DOM espera o fim do tick (`await tick()`).

## 1.6 — `watch` explícito, aviso com correção automática

- **O `watch` continua explícito** e é o único marcador de "isto é um efeito colateral que reage". Ele é raro: serve para sincronizar com o mundo externo (title, storage, analytics, log).
- Instruções reativas automáticas (estilo `$:` do Svelte 4) foram **descartadas**, por três motivos: a intenção (uma vez ou sempre) é ambígua, não há lugar para o cleanup e o código fica difícil de ler.
- **Aviso do compilador** para instrução solta no corpo que lê estado, com **correção automática** no editor ("envolver em `watch`"). O aviso não aparece em inicializadores de `let`, em early returns com JSX nem dentro de `onMount`/`watch`/handlers.

## 1.7 — Loop infinito

Um efeito que escreve num valor que ele mesmo lê é interrompido após **100 execuções seguidas**. Em dev aparece um erro com o arquivo, a linha e o nome da variável; em produção, um erro sem travar a aba.

## API resultante de efeitos e ciclo de vida

| API | Para quê | Frequência |
|---|---|---|
| `const` | Valores derivados | Sempre |
| `external(create, update?, destroy?)` | Libs e objetos com ciclo de vida | Comum |
| `on(alvo, evento, fn)` | Listeners globais | Comum |
| `watch(fn)` | Sincronizar com o mundo externo | Raro |
| `onMount(fn)` | Algo pontual após montar (focus, medir) | Raro |
| `onCleanup(fn)` | Cleanup manual | Raro |
| `untrack(fn)` | Escape avançado | Muito raro |
