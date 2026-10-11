# 01 — Visão e princípios

## O problema que queremos resolver

O React popularizou componentes declarativos com JSX, e esse modelo mental é excelente. O custo veio no modelo de execução:

| Dor no React | Causa raiz |
|---|---|
| `useState`, `useMemo`, `useCallback`, `useRef` | O componente **re-executa inteiro** a cada mudança, então tudo precisa ser "protegido" entre execuções |
| Arrays de dependência em `useEffect` | O runtime não sabe o que o efeito lê, então o dev precisa declarar à mão (e erra) |
| Re-render em cascata dos filhos | Re-renderizar o pai re-executa os filhos, a menos que se use `memo` |
| Closures obsoletas (stale closures) | Cada render cria novas closures com valores congelados |
| Regras dos hooks (sem `if`, sem loop) | Hooks são identificados pela ordem de chamada |
| Virtual DOM + diff | Para descobrir o que mudou, recria a árvore e compara |

O React Compiler resolve parte disso (memoização automática), mas mantém o modelo de re-execução. **A gente quer trocar o modelo.**

## A ideia central

> **O componente é um construtor, não uma função de render.**

- A função do componente roda **uma vez**, cria o DOM e conecta cada pedaço dinâmico ao signal que ele lê.
- Quando um valor muda, **apenas o nó do DOM ligado a ele** é atualizado: um texto, um atributo, uma classe.
- Não há diff porque não há o que comparar: o compilador já sabe, em tempo de build, quais partes são estáticas e quais são dinâmicas.

Isso atende (e vai além) do requisito "re-renderizar só o componente alterado, sem afetar os filhos": a granularidade não é por componente, é **por nó**.

## Princípios

1. **É só TypeScript.** O código-fonte é TSX válido. Nenhum formato de arquivo novo (como `.svelte` ou `.vue`). Tipagem, autocomplete, refactor e lint funcionam de fábrica.
2. **O compilador trabalha, o dev não.** Dependências, memoização e estabilidade de callbacks são inferidas em build.
3. **Pague só pelo que muda.** Partes estáticas viram HTML puro clonado. Partes dinâmicas viram bindings mínimos.
4. **Sem mágica escondida no runtime.** O output compilado deve ser legível. Um dev curioso consegue abrir o código gerado e entender (ver [03-compilador](03-compilador.md)).
5. **Erros em tempo de compilação, não em produção.** Se o compilador detecta um padrão que quebra a reatividade, ele avisa com uma mensagem acionável.
6. **Familiar para quem vem do React.** JSX, componentes como funções, props, `children`, `onClick`. O que muda é o que **sai** da API, não o que entra.
7. **API funcional, sem opinião fora dela.** Tudo o que a lib expõe são funções e componentes-função (`mount`, `watch`, `createStore`...). Sem classes, decorators ou herança na nossa API. O que o dev faz fora dela (services com classes, repositórios, injeção de dependência, arquitetura) é decisão dele: não impomos nem atrapalhamos. Na prática, instâncias de classe passam pela lib **intactas**, sem proxy (ver [04-runtime](04-runtime.md)).

## O que mantemos do React

- JSX/TSX como linguagem de template
- Componentes como funções que recebem props
- Composição via `children`
- Fluxo de dados unidirecional por padrão

## O que removemos

- Hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `memo`)
- Virtual DOM e reconciliação por diff de árvore
- Re-execução do componente
- Arrays de dependência
- `className` (usamos `class`, como no HTML)

## Prior art (e onde nos diferenciamos)

Ser honesto aqui ajuda a validar a ideia: partes disso já existem. O diferencial precisa estar na **combinação** e na **experiência**.

| Projeto | O que tem | O que falta (para nós) |
|---|---|---|
| **SolidJS** | Signals, sem VDOM, JSX, componente roda uma vez | API explícita (`createSignal`, `count()`), destructuring de props quebra a reatividade, `<For>`/`<Show>` obrigatórios |
| **Svelte 4** | `let` reativo, compilador | Formato `.svelte`, `$:` estranho, reatividade só funciona dentro do componente |
| **Svelte 5** | Runes (`$state`, `$derived`), signals | Ainda `.svelte`, runes são sintaxe nova a aprender |
| **Vue Vapor** | Sem VDOM, compilador | SFC `.vue`, `ref().value` |
| **React Compiler** | Memoização automática | Mantém re-render e VDOM |

**Nossa aposta:** a reatividade implícita do Svelte + a performance e o modelo de execução do Solid + o TSX puro do React, com o compilador consertando as armadilhas do Solid (destructuring de props, `.map` em vez de `<For>`, `count` em vez de `count()`).
