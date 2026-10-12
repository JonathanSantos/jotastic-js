/**
 * Contrato do pacote público `jotastic` (o que o DEV importa), `jotastic/store` e `jotastic/fetch`.
 * Os tipos são os que o dev vê; o compilador reescreve as chamadas para o runtime (ver 18-transformacoes.md).
 */
import type { ErrorInfo } from './runtime'

// ─────────────────────────────────────────────────────────────────────────────
// `jotastic`
// ─────────────────────────────────────────────────────────────────────────────

export type Component<P = {}> = (props: P) => JSX.Element | Promise<JSX.Element>
export type ParentProps<P = {}> = P & { children?: JSX.Element }

export interface MountOptions {
  /** Funções `(app) => void` executadas antes de renderizar. */
  plugins?: Array<(app: AppContext) => void>
  /** Erros que nenhum <Boundary> capturou. */
  onError?: (error: unknown, info: ErrorInfo) => void
}
export interface AppContext {
  /** Fornece um contexto para toda a árvore (plugins: router, i18n…). */
  provide<T>(ctx: Context<T>, value: T): void
  onError(handler: NonNullable<MountOptions['onError']>): void
  readonly target: Element
}
/** Monta a app. `el` é um JSX avaliado de forma lazy pelo compilador. Devolve `unmount`. */
export function mount(el: JSX.Element, target: Element | string, options?: MountOptions): () => void

/** Efeito com cleanup opcional, sem deps. Roda depois de montar. */
export function watch(fn: () => void | (() => void)): void
/** Listener removido automaticamente. O alvo é lazy: re-liga quando muda. */
export function on<T extends EventTarget, K extends keyof EventMapOf<T>>(
  target: T | null | undefined, type: K, handler: (this: T, ev: EventMapOf<T>[K]) => unknown, options?: AddEventListenerOptions,
): void
export function on(target: EventTarget | null | undefined, type: string, handler: (ev: Event) => unknown, options?: AddEventListenerOptions): void
/** Objeto com ciclo de vida. O dev vê `T`; o compilador reescreve as leituras. Ler antes de montar é erro de compilação. */
export function external<T>(create: () => T, update?: (value: T) => void, destroy?: (value: T) => void): T
export function onMount(fn: () => void): void
export function onCleanup(fn: () => void): void
export function untrack<T>(fn: () => T): T
export function tick(): Promise<void>
/** Marca um valor para não ser proxiado, ou desembrulha um proxy. */
export function raw<T>(value: T): T
/** Dev only: loga a cada mudança. Removido em prod pelo compilador. */
export function inspect(...values: unknown[]): void

/** `true` enquanto o recurso de `value` (vindo de `await`) está recarregando. Só aceita variáveis vindas de `await` (compilador valida). */
export function pending(value: unknown): boolean
/** Reexecuta o recurso de `value`. */
export function refresh(value: unknown): void
/** Signal ambiente: do recurso em execução, do `watch` em execução, ou um que nunca aborta. */
export function abortSignal(): AbortSignal

export interface BoundaryProps {
  pending?: JSX.Element
  /** Não-Error lançados são embrulhados em `Error` pelo runtime (`cause` guarda o original). */
  error?: (error: Error, retry: () => void) => JSX.Element
  children?: JSX.Element
}
export function Boundary(props: BoundaryProps): JSX.Element
export function Portal(props: { to: Element; children?: JSX.Element }): JSX.Element
/** Marcador de slot; só válido como filho direto de um componente. Compilado, nunca executa. */
export function Slot(props: { name: string; children?: JSX.Element | ((...args: any[]) => JSX.Element) }): JSX.Element

export type SlotFn = (...args: any[]) => JSX.Element
/** Mapa de slots: `useSlots<{ header: JSX.Element; row: (item: Item) => JSX.Element }>(children)`. */
export type Slots<S extends Record<string, JSX.Element | SlotFn> = {}> = { default: JSX.Element } & Partial<S>
export function useSlots<S extends Record<string, JSX.Element | SlotFn> = {}>(children: JSX.Element | undefined): Slots<S>

// contexto (fase 2, já tipado)
export interface Context<T> { readonly id: symbol; readonly defaultValue: T | undefined; Provider: Component<{ value: T; children?: JSX.Element }> }
export function createContext<T>(defaultValue?: T): Context<T>
export function useContext<T>(ctx: Context<T>): T

type EventMapOf<T> =
  T extends Window ? WindowEventMap :
  T extends Document ? DocumentEventMap :
  T extends HTMLElement ? HTMLElementEventMap :
  T extends MediaQueryList ? MediaQueryListEventMap :
  T extends WebSocket ? WebSocketEventMap :
  Record<string, Event>

// ─────────────────────────────────────────────────────────────────────────────
// `jotastic/store`
// ─────────────────────────────────────────────────────────────────────────────

export type DeepReadonly<T> =
  T extends (...args: any[]) => any ? T :
  T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepReadonly<U>> :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

export type SetFn<S> = (update: Partial<S> | ((draft: S) => Partial<S> | void)) => void

export type Store<S extends object, M extends object> = DeepReadonly<S> & M & {
  /** Cópia plana do ESTADO, sem proxy (sem getters nem ações). */
  $snapshot(): S
  /** Volta ao estado inicial (reavalia `state` se for função). */
  $reset(): void
  /** Nome para o devtools (inferido do export pelo compilador; ou `options.name`). */
  readonly $name: string
}

/**
 * D62: dois argumentos. `state` (objeto ou função que o devolve) é o estado reativo e dá o tipo `S` por inferência.
 * `members(set, get)` devolve getters (viram memos) e ações (embrulhadas em `batch` + flag `inAction`).
 * - `get()` devolve o estado (mutável dentro de ações, readonly fora — em dev avisa `store-mutated-outside-action`).
 * - `set`: objeto → merge raso; função com retorno → merge do retorno; função sem retorno → mutações no draft valem.
 *   Cada folha compara `Object.is`; objetos trocam de referência (sem reconcile).
 * - Nenhum flush síncrono (D61): o DOM atualiza no microtask, como em todo o resto da lib.
 */
export function createStore<S extends object, M extends object = {}>(
  state: S | (() => S),
  members?: (set: SetFn<S>, get: () => S) => M,
  options?: { name?: string },
): Store<S, M>

// ─────────────────────────────────────────────────────────────────────────────
// `jotastic/fetch`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drop-in de `fetch` que anexa `abortSignal()` quando `init.signal` não foi informado.
 * Se já há `init.signal`, combina os dois (`AbortSignal.any`).
 */
export function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
