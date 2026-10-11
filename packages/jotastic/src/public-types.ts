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
  error?: (error: unknown, retry: () => void) => JSX.Element
  children?: JSX.Element
}

export type SlotFn = (...args: any[]) => JSX.Element
export type Slots<N extends string = never> = { default: JSX.Element } & { [K in N]?: JSX.Element | SlotFn }

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

export type Store<S extends object> = DeepReadonly<S> & {
  /** Cópia plana, sem proxy. */
  $snapshot(): S
  /** Volta ao estado inicial (reexecuta a factory). */
  $reset(): void
  /** Nome para o devtools (inferido do export pelo compilador; pode ser passado em `createStore(factory, { name })`). */
  readonly $name: string
}
