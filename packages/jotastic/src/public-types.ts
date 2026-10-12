/**
 * Tipos da API pública de `jotastic`, `jotastic/store` e `jotastic/fetch` (só tipos).
 * Contrato: `docs/spec/contracts/jotastic.d.ts`. As funções são declaradas nas implementações
 * (`src/index.ts`, `src/store.ts`, `src/fetch.ts`), que reexportam estes tipos.
 */
import type { ErrorInfo } from './runtime/index.js'
import type { JSX } from 'jotastic/jsx-runtime'

export type { ErrorInfo, JSX }

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

export interface BoundaryProps {
  pending?: JSX.Element
  /** Não-Error lançados são embrulhados em `Error` pelo runtime (`cause` guarda o original). */
  error?: (error: Error, retry: () => void) => JSX.Element
  children?: JSX.Element
}

export type SlotFn = (...args: any[]) => JSX.Element
/** Mapa de slots (T-5): `useSlots<{ header: JSX.Element; row: (item: Item) => JSX.Element }>(children)`. */
export type Slots<S extends Record<string, JSX.Element | SlotFn> = {}> = { default: JSX.Element } & Partial<S>

// contexto (fase 2, já tipado)
export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T | undefined
  Provider: Component<{ value: T; children?: JSX.Element }>
}

export type EventMapOf<T> = T extends Window
  ? WindowEventMap
  : T extends Document
    ? DocumentEventMap
    : T extends HTMLElement
      ? HTMLElementEventMap
      : T extends MediaQueryList
        ? MediaQueryListEventMap
        : T extends WebSocket
          ? WebSocketEventMap
          : Record<string, Event>

// ─────────────────────────────────────────────────────────────────────────────
// `jotastic/store`
// ─────────────────────────────────────────────────────────────────────────────

export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

export type SetFn<S> = (update: Partial<S> | ((draft: S) => Partial<S> | void)) => void

export type Store<S extends object, M extends object> = DeepReadonly<S> &
  M & {
    /** Cópia plana do ESTADO, sem proxy (sem getters nem ações). */
    $snapshot(): S
    /** Volta ao estado inicial (reavalia `state` se for função). */
    $reset(): void
    /** Nome para o devtools (inferido do export pelo compilador; ou `options.name`). */
    readonly $name: string
  }
