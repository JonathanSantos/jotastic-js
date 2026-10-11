/**
 * Contrato do pacote interno `jotastic/runtime`.
 * É o que o código COMPILADO chama. Nada daqui aparece no tutorial.
 * Cada função tem: assinatura, semântica, casos de borda e evento de devtools que emite.
 * Prosa complementar em ../17-contratos.md.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tipos básicos
// ─────────────────────────────────────────────────────────────────────────────

export type Cleanup = () => void
export type Dispose = () => void

/** Metadados injetados pelo compilador só em dev. Em prod o argumento é omitido. */
export interface DevMeta {
  name?: string        // nome da variável/binding ("count", "text:count")
  loc?: string         // "Counter.tsx:3:7"
}

export interface Signal<T> {
  /** Lê e, se houver um contexto de rastreamento ativo, assina. */
  get(): T
  /**
   * Escreve. `Object.is(prev, next)` → no-op (nenhum dependente é marcado).
   * Marca dependentes como DIRTY/CHECK e agenda os efeitos no microtask.
   * A leitura logo em seguida (`get()`) já devolve `next`.
   */
  set(next: T): void
  /** Lê sem assinar. */
  peek(): T
}

export interface Memo<T> {
  /**
   * Devolve o valor. Se marcado CHECK/DIRTY, recalcula ANTES de devolver (pull).
   * Se o resultado for igual ao anterior (ver `equals`), os dependentes NÃO são notificados.
   */
  get(): T
  peek(): T
}

// ─────────────────────────────────────────────────────────────────────────────
// Núcleo reativo
// ─────────────────────────────────────────────────────────────────────────────

/** Signal simples. O compilador o emite quando o inicializador e todas as atribuições são "provavelmente primitivos". */
export function signal<T>(initial: T, dev?: DevMeta): Signal<T>

/**
 * Signal que converte POJO/array em objeto reativo ao entrar (`toReactive`).
 * É o padrão para `let` cujo tipo o compilador não consegue provar primitivo.
 * `state(v).get() === reactive(v)` quando `v` é POJO/array; caso contrário é `v`.
 */
export function state<T>(initial: T, dev?: DevMeta): Signal<T>

export interface MemoOptions<T> extends DevMeta {
  /**
   * Comparador. Padrão: `Object.is(a, b)` OU (ambos arrays / ambos POJO e `shallowEqual(a, b)`).
   * `false` desliga a comparação (sempre notifica).
   */
  equals?: ((a: T, b: T) => boolean) | false
}

/**
 * Derivado memoizado.
 * - EXECUTA `fn` IMEDIATAMENTE na criação (ordem do código, D26), rastreando as leituras.
 * - Se não leu nenhuma fonte reativa, vira constante: `get()` devolve o valor em O(1) e nunca mais roda.
 * - Depois disso é lazy: só recalcula quando uma fonte mudou E alguém chama `get()`.
 * - Em dev, se o valor devolvido for POJO/array, `get()` devolve um proxy readonly que avisa `derived-mutated` ao escrever.
 * - Em dev, se o valor for instância de classe e o memo já recalculou ≥ 1 vez, avisa `derived-recreates-instance`.
 * - Exceção em `fn`: propaga para quem chamou `get()` (na criação: para o setup → `handleError(owner, e, 'setup')`).
 */
export function memo<T>(fn: () => T, opts?: MemoOptions<T>): Memo<T>

export interface EffectOptions extends DevMeta {
  /**
   * 'render': binding de DOM. A PRIMEIRA execução é SÍNCRONA (durante o setup), as seguintes no flush, fila de render.
   * 'user'  : `watch`/`onMount`/`on`/`external`. A primeira execução é no flush (depois do DOM estar pronto), fila de usuário.
   * Padrão: 'user'.
   */
  kind?: 'render' | 'user'
}

/**
 * Efeito com rastreamento automático.
 * - A função pode devolver um cleanup, executado antes da próxima execução e no dispose.
 * - Dependências são recoletadas a cada execução.
 * - Pertence ao owner atual (`getOwner()`); é descartado com ele. Fora de owner: erro `use-outside-owner` em dev, vive para sempre em prod.
 * - Durante a execução, `abortSignal()` devolve um AbortSignal abortado no cleanup (D54).
 * - Loop guard: se o mesmo efeito for re-executado 100 vezes dentro de um único `flush()`, lança `effect-loop`.
 * - Erro dentro de `fn` → `handleError(owner, e, kind === 'render' ? 'binding' : 'effect')`; o efeito continua vivo.
 */
export function effect(fn: () => void | Cleanup, opts?: EffectOptions): Dispose

/** Executa `fn` sem rastrear leituras. */
export function untrack<T>(fn: () => T): T

/**
 * Agrupa escritas. Como o flush já é em microtask, `batch` só garante que efeitos SÍNCRONOS
 * disparados por `flush()` manual dentro de `fn` não rodem no meio. Ações de store usam.
 */
export function batch<T>(fn: () => T): T

/**
 * Processa as filas AGORA, de forma síncrona: (1) fila de render em ordem de id, (2) fila de usuário em ordem de id,
 * repetindo enquanto houver itens (efeitos criados durante o flush entram no mesmo flush).
 * Efeitos cujo owner foi descartado são pulados.
 */
export function flush(): void

/** Promise resolvida depois do próximo flush (ou imediatamente se não há nada agendado). */
export function tick(): Promise<void>

/** `true` se há um contexto de rastreamento ativo (útil para `useSlots`, helpers). */
export function isTracking(): boolean

// ─────────────────────────────────────────────────────────────────────────────
// Owner tree
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorPhase = 'setup' | 'binding' | 'effect' | 'handler' | 'async'

export interface ErrorInfo {
  phase: ErrorPhase
  owner: Owner
  component?: string   // nome do componente mais próximo (dev)
  loc?: string
}

export interface Owner {
  readonly id: number                      // crescente; a ordem de criação É a ordem de cima para baixo
  readonly parent: Owner | null
  readonly depth: number
  /** Componente dono deste owner (dev), ou undefined para branches/itens/continuações. */
  readonly name?: string
  readonly kind: 'root' | 'component' | 'branch' | 'item' | 'continuation' | 'boundary' | 'portal' | 'external'
  disposed: boolean
  /** Contexto (createContext). Lookup sobe pela cadeia de `parent`. */
  context: Map<symbol, unknown> | null
  /** Fronteira mais próxima (inclusive) para erros e pending. */
  boundary: BoundaryHandle | null
}

export function createOwner(kind: Owner['kind'], parent?: Owner | null, dev?: DevMeta): Owner
export function getOwner(): Owner | null
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T
/** Registra cleanup no owner atual. Rodam em ordem reversa no dispose. */
export function onCleanup(fn: Cleanup): void
/**
 * Descarta recursivamente: filhos (reverso), depois efeitos e cleanups (reverso), depois nós registrados.
 * Idempotente. Efeitos pendentes na fila são ignorados.
 */
export function dispose(owner: Owner): void
/**
 * Roteia um erro: sobe até o `boundary` mais próximo que tenha handler de erro; se não houver,
 * chama `onError` do root (opção de `mount`); se não houver, `console.error`.
 * Nunca lança para o chamador (exceto quando a própria fronteira é o root sem handler em modo de teste).
 */
export function handleError(owner: Owner | null, error: unknown, phase: ErrorPhase): void

// ─────────────────────────────────────────────────────────────────────────────
// Objetos reativos (proxy profundo e lazy)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converte POJO (protótipo Object.prototype ou null) e Array em proxy reativo. Qualquer outra coisa volta intacta.
 * - Identidade estável: `reactive(x) === reactive(x)`, `reactive(reactive(x)) === reactive(x)`.
 * - Lazy: o proxy de `obj.a` só é criado quando `obj.a` é lido.
 * - Um signal por propriedade, criado no primeiro acesso.
 * - Arrays: um signal estrutural (`$iter`) notificado por push/splice/sort/reverse/length/índice novo; `length` tem signal próprio.
 * - `ownKeys`, `has`, `for…in`, `Object.keys`, iteração: assinam `$iter`.
 * - `set`: `Object.is` → no-op. Valor novo POJO/array é guardado RAW (proxy só na leitura). Troca de referência, nunca reconcile.
 * - `deleteProperty`: notifica a chave e `$iter`.
 * - `includes`/`indexOf`/`lastIndexOf`: tentam com o argumento e com `raw(arg)`.
 * - Mutadores de array rodam em `batch`.
 * - Valores marcados com `raw()` (WeakSet) nunca são proxiados.
 */
export function reactive<T extends object>(target: T): T

/** Se `v` é proxy reativo, devolve o alvo. Se é POJO/array raw, marca-o para nunca ser proxiado. Outros valores: identidade. */
export function raw<T>(v: T): T
export function isReactive(v: unknown): boolean
/** Equivalente a `reactive` para o `state()`: POJO/array → proxy, senão identidade. */
export function toReactive<T>(v: T): T

/** Dev only. Proxy que lança/avisa em escrita, com o diagnóstico e a loc informados. Em prod devolve `v`. */
export function readonly<T>(v: T, diagnostic: 'derived-mutated' | 'store-mutated-outside-action', dev?: DevMeta): T

/** Comparação rasa: mesmo length e `Object.is` por índice / mesmas chaves e `Object.is` por valor. */
export function shallowEqual(a: unknown, b: unknown): boolean

// ─────────────────────────────────────────────────────────────────────────────
// Templates e bindings de DOM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compila `html` UMA vez (via <template>) e devolve uma fábrica que clona o primeiro filho (`cloneNode(true)`).
 * `html` tem exatamente UM elemento raiz. Posições dinâmicas são o comentário vazio `<!>`.
 * `svg=true` parseia dentro de <svg> para o namespace correto.
 */
export function template(html: string, svg?: boolean): () => Element

/**
 * Insere/atualiza o conteúdo dinâmico de `{expr}`.
 * - `value` função → tratado como accessor: cria um efeito de render.
 * - Normalização do valor: null/undefined/boolean → nada; string/number/bigint → Text (reutiliza o Text anterior e só escreve `.data` se mudou);
 *   Node → o nó; Array → flatten recursivo e normalização de cada item; função dentro do valor → chamada (accessor aninhado, memoizado).
 * - `marker`: comentário âncora. Os nós são inseridos ANTES do marker e o conjunto atual é lembrado para substituição.
 *   `marker === null` → `parent` tem só este conteúdo (pode usar `textContent` como fast path).
 * - Troca de conteúdo: remove os nós atuais, insere os novos. Não há diff de array aqui (isso é `list`).
 */
export function insert(parent: Node, value: unknown, marker?: Node | null): void

/** `setAttribute(name, String(v))`; `null | undefined | false` → `removeAttribute`. `true` → `""`. */
export function attr(el: Element, name: string, read: () => unknown): void
/** `el[name] = v` (value, checked, selected, innerHTML, textContent, muted, volume…). Guard: só escreve se `el[name] !== v`. Para `value`, compara como string. */
export function prop(el: Element, name: string, read: () => unknown): void
/** Atributo booleano (`disabled`, `hidden`, `required`, `open`…): `v ? setAttribute(name, '') : removeAttribute`. */
export function bool(el: Element, name: string, read: () => unknown): void

export type ClassValue = string | null | undefined | false | Record<string, unknown> | ClassValue[]
/**
 * Aplica classes dinâmicas SEM apagar as classes estáticas do template.
 * Normaliza `ClassValue` para um Set<string>; diff com o Set anterior: `classList.add/remove` só do que mudou.
 */
export function classList(el: Element, read: () => ClassValue): void

export type StyleValue = string | null | undefined | Record<string, string | number | null | undefined>
/**
 * Objeto: diff por propriedade com o anterior; `style.setProperty(kebab(k), v)` / `removeProperty`. Chaves camelCase viram kebab;
 * chaves começando com `--` são passadas intactas. Número em propriedade de comprimento conhecida (width, fontSize…) recebe `px`.
 * String: `el.style.cssText = v`.
 */
export function style(el: HTMLElement | SVGElement, read: () => StyleValue): void

/**
 * Espalha um objeto de props em um elemento. Um binding por chave, decidido pela tabela de atributos (18-transformacoes.md §5):
 * `class`/`className` → classList; `style` → style; `on*` → listen; `ref` → chamada; `children` → insert; booleanos → bool; propriedades → prop; resto → attr.
 * Two-way: se o objeto tem `value`/`checked` com SETTER (descriptor) e não tem `onInput`/`onChange`, adiciona o listener de two-way com coerção pelo `el.type`.
 * Chaves que somem entre execuções são removidas.
 */
export function spread(el: Element, read: () => Record<string, unknown>): void

/**
 * `addEventListener` direto. O handler é embrulhado: `runWithOwner(owner, …)`, try/catch → `handleError(owner, e, 'handler')`,
 * e se devolver Promise, `.catch` → idem. Removido no dispose do owner.
 */
export function listen(el: EventTarget, type: string, handler: (e: Event) => unknown, opts?: AddEventListenerOptions): void

/**
 * Two-way gerado pelo compilador para `value`/`checked` sem handler.
 * `kind` decide o evento e a coerção:
 *   'value'    → 'input',  string
 *   'number'   → 'input',  valueAsNumber (NaN → null)
 *   'checked'  → 'change', checked
 *   'select'   → 'change', value
 *   'multiple' → 'change', Array.from(selectedOptions, o => o.value)
 */
export function twoWay(el: Element, kind: 'value' | 'number' | 'checked' | 'select' | 'multiple', write: (v: unknown) => void): void

/** Chama `.focus()` no próximo flush se o elemento tem `autofocus` e acabou de ser inserido por um branch/lista/continuação. */
export function autofocus(el: Element): void

// ─────────────────────────────────────────────────────────────────────────────
// Componentes e controle de fluxo
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado de um componente / de uma expressão de JSX. Funções são accessors (lazy). */
export type Rendered = Node | Node[] | string | number | boolean | null | undefined | (() => Rendered)

/**
 * Invoca um componente dentro de um owner próprio (kind 'component', name = Comp.name em dev).
 * Erro no setup → `handleError(owner, e, 'setup')` e devolve null.
 * Devolve o que o componente devolveu (pode ser accessor).
 */
export function component<P>(Comp: (props: P) => Rendered | Promise<never>, props: P, dev?: DevMeta): Rendered

/** `key` em componente/elemento: recria `render()` (dispose do owner anterior) quando `key()` muda (`Object.is`). Devolve accessor. */
export function keyed(key: () => unknown, render: () => Rendered): () => Rendered

/**
 * Condicional com N casos + fallback. Devolve accessor para `insert`.
 * - `index = memo(() => cases.findIndex(([cond]) => cond()))` → só muda quando o CASO ativo muda, não quando a condição muda de valor.
 * - Ao mudar: dispose do owner do branch anterior (kind 'branch'), cria owner novo, roda `render` dentro dele (untracked para fora).
 * - Mesmo índice → nada acontece.
 * - `fallback` ausente e nenhum caso verdadeiro → null (âncora só).
 */
export function branches(cases: Array<[cond: () => boolean, render: () => Rendered]>, fallback?: () => Rendered): () => Rendered

/**
 * Lista com chave sobre nós reais.
 * - `source()` é lido em um efeito de render; assina o signal estrutural do array (uma assinatura, não uma por índice).
 * - `key(item, i)`: padrão → objeto: `item.id ?? item.key ?? item`; primitivo: índice. Chaves duplicadas: aviso em dev, a segunda ganha sufixo.
 * - Cada item tem owner (kind 'item') e um `index: Signal<number>` atualizado ao mover.
 * - Reconciliação: prefixo/sufixo comum, depois Map<key, row>; novos criados, ausentes descartados (dispose), existentes MOVIDOS (insertBefore).
 *   Pós-MVP: LIS para minimizar moves.
 * - Primitivos (chave = índice): se o valor na posição mudou, a linha é descartada e recriada.
 * - Se todas as chaves anteriores foram descartadas e havia ≥ 1, emite devtools `list:recreated`.
 * - Nós são inseridos antes de `marker` (ou ao fim de `parent` se null).
 */
export function list<T>(
  parent: Node,
  marker: Node | null,
  source: () => readonly T[],
  render: (item: T, index: () => number) => Rendered,
  key?: (item: T, index: number) => unknown,
  dev?: DevMeta,
): void

/**
 * Memoiza os children resolvidos de um componente (evita criar nós duas vezes quando `props.children` é lido mais de uma vez).
 * Devolve accessor que resolve accessors aninhados até nós/arrays.
 */
export function children(read: () => Rendered): () => Rendered

/** Objeto de slots gerado pelo compilador. `default` sempre existe (pode devolver null). */
export interface Slots {
  readonly [SLOTS]: true
  default: () => Rendered
  [name: string]: (() => Rendered) | ((...args: any[]) => Rendered) | true
}
export const SLOTS: unique symbol
/** `children` já é `Slots` → devolve. Senão devolve `{ default: children(…) }`. */
export function slots(childrenValue: unknown): Slots

/**
 * Portal: renderiza `render()` dentro de `target` mantendo o owner atual (contexto, erros).
 * Devolve null (nenhum nó no lugar de origem). Remove os nós no dispose.
 */
export function portal(target: () => Element, render: () => Rendered): null

// ─────────────────────────────────────────────────────────────────────────────
// Async
// ─────────────────────────────────────────────────────────────────────────────

export interface Resource<T> {
  readonly value: Signal<T | undefined>
  readonly error: Signal<unknown>
  /** true até o PRIMEIRO valor ou erro. */
  readonly loading: Signal<boolean>
  /** true enquanto uma reexecução está em andamento depois do primeiro valor. */
  readonly pending: Signal<boolean>
  /** Reexecuta `fn` mantendo `value` (stale-while-revalidate). */
  refresh(): void
  readonly version: number
}

/**
 * Recurso reativo para `await` no corpo do componente.
 * - `fn` roda em um efeito de render (rastreia o que lê). A cada execução: aborta o AbortController anterior, cria um novo,
 *   publica-o como signal ambiente (`currentAbortSignal`), chama `fn(signal)` SÍNCRONAMENTE (o ambiente vale só nessa parte), incrementa `version`.
 * - Resolução com `version` antiga → ignorada. Rejeição com `AbortError` → ignorada.
 * - Valor POJO/array → `toReactive` antes de guardar.
 * - Erro → `error.set(e)`, `handleError(owner, e, 'async')`.
 * - `fn` síncrona (não Promise) → valor imediato, sem pending.
 * - Registra-se no `boundary` mais próximo (para `pending`).
 * - Dispose do owner → aborta o controller atual.
 */
export function resource<T>(fn: (signal: AbortSignal) => Promise<T> | T, dev?: DevMeta): Resource<T>

/** Signal ambiente (D49/D54): o do `resource` em execução síncrona, senão o do `effect` em execução, senão um signal que nunca aborta. */
export function abortSignal(): AbortSignal

/**
 * Continuação de `await`: devolve accessor para `insert`.
 * - Enquanto `res.loading` → null (o boundary mostra pending). Com `res.error` → null (o boundary mostra erro).
 * - Quando `res.value` existe pela primeira vez: cria owner (kind 'continuation'), roda `fn` UMA vez dentro dele e devolve o resultado.
 * - Reexecuções do recurso NÃO recriam a continuação (os bindings leem `res.value.get()`).
 * - Se o recurso voltar a `loading` (não acontece por padrão) ou entrar em erro depois de criado: dispose da continuação.
 */
export function continuation(res: Resource<unknown>, fn: () => Rendered): () => Rendered

export interface BoundaryHandle {
  readonly owner: Owner
  /** Recursos registrados (para pending). */
  track(res: Resource<unknown>): void
  /** Chamado por handleError. Devolve true se tratou. */
  catch(error: unknown, info: ErrorInfo): boolean
}

export interface BoundaryProps {
  pending?: () => Rendered
  error?: (error: unknown, retry: () => void) => Rendered
  children: () => Rendered
}
/**
 * Fronteira única de pending + erro (D48). Devolve accessor.
 * - Cria owner (kind 'boundary') com `boundary = handle`.
 * - Renderiza `children` dentro dele IMEDIATAMENTE (os recursos precisam rodar para registrar), mas mantém os nós fora do DOM
 *   enquanto `anyLoading` (algum recurso rastreado com `loading`); mostra `pending()` nesse meio-tempo.
 * - `state = memo(() => error ? 'error' : anyLoading ? 'pending' : 'ok')`.
 * - Erro capturado (de qualquer fase): dispose dos children, mostra `error(e, retry)`. `retry` recria children do zero.
 * - Sem `error`: não captura (o erro sobe). Sem `pending`: enquanto carrega mostra nada.
 */
export function boundary(props: BoundaryProps): () => Rendered

// ─────────────────────────────────────────────────────────────────────────────
// Integração com o mundo externo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `external(create, update?, destroy?)` (04 §external). Devolve Signal<T> (o compilador reescreve as leituras para `.get()`).
 * - `create` roda em efeito de usuário (depois do DOM). Com `update`: `create` é UNTRACKED e `update(value)` roda em efeito rastreado.
 *   Sem `update`: `create` é rastreado e, ao mudar, `destroy` + `create` de novo.
 * - `get()` antes de criar: em dev lança `ref-before-mount`; em prod devolve undefined.
 * - Dispose/recriação: `destroy(value)` se informado; senão o primeiro que existir: [Symbol.dispose], destroy, dispose, disconnect, unsubscribe;
 *   `close`/`abort`/`terminate` só se `value instanceof` WebSocket | EventSource | AbortController | Worker | MessagePort | IDBDatabase.
 */
export function external<T>(create: () => T, update?: (value: T) => void, destroy?: (value: T) => void, dev?: DevMeta): Signal<T>

/**
 * `on(alvo, tipo, handler, opts)` com alvo LAZY (D53). Efeito de usuário: lê `target()`; se for um EventTarget, adiciona o listener;
 * cleanup remove. Re-liga quando `target()` muda. Handler embrulhado como em `listen`.
 */
export function on(target: () => EventTarget | null | undefined, type: string, handler: (e: Event) => unknown, opts?: AddEventListenerOptions): void

/** `onMount(fn)` público = efeito de usuário que roda `fn` untracked uma vez. */
export function onMount(fn: () => void): void

// ─────────────────────────────────────────────────────────────────────────────
// Props e contexto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Para `...rest` em props: devolve um objeto com getters que encaminham para `props`, excluindo `keys`.
 * `ownKeys` reflete as chaves atuais de `props`.
 */
export function rest<P extends object, K extends keyof P>(props: P, keys: readonly K[]): Omit<P, K>

/**
 * Para `<Comp {...a} x={1} {...b} />`: mescla fontes preservando getters (a última fonte vence por chave).
 * Fontes podem ser objetos ou funções que devolvem objetos (reavaliadas a cada leitura).
 */
export function mergeProps(...sources: Array<object | (() => object)>): Record<string, unknown>

export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T | undefined
}
export function createContext<T>(defaultValue?: T): Context<T>
/** Registra `value` no owner atual. */
export function provide<T>(ctx: Context<T>, value: T): void
/** Sobe pela cadeia de owners; se não achar, `defaultValue`; se nem isso, erro em dev. */
export function useContext<T>(ctx: Context<T>): T

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export interface RootOptions {
  onError?: (error: unknown, info: ErrorInfo) => void
  dev?: DevMeta
}
/**
 * Cria um owner raiz, roda `render()` dentro dele, insere o resultado em `target` (via `insert(target, …, null)`),
 * chama `flush()` SÍNCRONO e devolve `unmount` (dispose + remove nós).
 */
export function createRoot(target: Element, render: () => Rendered, opts?: RootOptions): Dispose

// ─────────────────────────────────────────────────────────────────────────────
// Dev
// ─────────────────────────────────────────────────────────────────────────────

/** `inspect(...values)`: em dev, efeito de usuário que loga com nome/loc a cada mudança. Em prod o compilador remove a chamada. */
export function inspect(dev: DevMeta, ...reads: Array<() => unknown>): void

/** Hook do devtools. Ver ./devtools.d.ts. */
export function emitDevtools(event: import('./devtools').DevtoolsEvent): void
