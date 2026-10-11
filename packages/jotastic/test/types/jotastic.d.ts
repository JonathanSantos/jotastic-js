/**
 * Módulo `jotastic` para o typecheck dos exemplos: tipos de `src/public-types.ts` + funções declaradas conforme
 * `docs/spec/contracts/jotastic.d.ts` (as implementações reais chegam nos passos 3/7/9).
 */
import type { BoundaryProps, Context, EventMapOf, JSX, MountOptions, Slots } from '../../src/public-types.js'

export type {
  AppContext,
  BoundaryProps,
  Component,
  Context,
  ErrorInfo,
  EventMapOf,
  MountOptions,
  ParentProps,
  SlotFn,
  Slots,
} from '../../src/public-types.js'

export declare function mount(el: JSX.Element, target: Element | string, options?: MountOptions): () => void
export declare function watch(fn: () => void | (() => void)): void
export declare function on<T extends EventTarget, K extends keyof EventMapOf<T>>(
  target: T | null | undefined,
  type: K,
  handler: (this: T, ev: EventMapOf<T>[K]) => unknown,
  options?: AddEventListenerOptions,
): void
export declare function on(
  target: EventTarget | null | undefined,
  type: string,
  handler: (ev: Event) => unknown,
  options?: AddEventListenerOptions,
): void
export declare function external<T>(create: () => T, update?: (value: T) => void, destroy?: (value: T) => void): T
export declare function onMount(fn: () => void): void
export declare function onCleanup(fn: () => void): void
export declare function untrack<T>(fn: () => T): T
export declare function tick(): Promise<void>
export declare function raw<T>(value: T): T
export declare function inspect(...values: unknown[]): void
export declare function pending(value: unknown): boolean
export declare function refresh(value: unknown): void
export declare function abortSignal(): AbortSignal
export declare function Boundary(props: BoundaryProps): JSX.Element
export declare function Portal(props: { to: Element; children?: JSX.Element }): JSX.Element
export declare function Slot(props: {
  name: string
  children?: JSX.Element | ((...args: any[]) => JSX.Element)
}): JSX.Element
export declare function useSlots<N extends string = never>(children: JSX.Element | undefined): Slots<N>
export declare function createContext<T>(defaultValue?: T): Context<T>
export declare function useContext<T>(ctx: Context<T>): T
