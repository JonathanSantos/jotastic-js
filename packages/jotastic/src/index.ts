// `jotastic`: a API pública que o dev importa (contrato: docs/spec/contracts/jotastic.d.ts).
//
// O compilador reescreve a maior parte dessas chamadas dentro de corpos reativos (18-transformacoes.md §4, §10, §12–§14):
// `watch` → `effect`, `on(t, …)` → `on(() => t, …)`, `external` → runtime com dev meta, `pending(x)`/`refresh(x)` →
// `_rN.pending.get()`/`_rN.refresh()`, `useSlots(children)` → `slots(props.children)`, `<Slot>` → objeto de slots.
// O que continua importado daqui (`mount`, `Boundary`, `Portal`, `createContext`, `useContext`, `tick`, `raw`,
// `onMount`, `onCleanup`, `untrack`) é implementação real. Das demais, as que fazem sentido sem compilador (chamadas
// fora de corpo reativo não são transformadas, §11) também são reais; só as que dependem da reescrita das leituras
// (`external`, `Slot`, `pending`/`refresh` sobre um valor comum) são marcadores que lançam `not-compiled`.

import type { Rendered } from './runtime/flow'
import { boundary, type Resource } from './runtime/async'
import { DEV } from './runtime/env'
import { inspect as runtimeInspect, on as runtimeOn } from './runtime/external'
import { portal, slots } from './runtime/flow'
import { getOwner, jotasticError, runWithOwner, setOnError, type ErrorInfo } from './runtime/owner'
import { createContext as runtimeCreateContext, provide } from './runtime/props'
import { effect } from './runtime/reactive'
import { createRoot } from './runtime/root'
import type {
  AppContext,
  BoundaryProps,
  Component,
  Context,
  EventMapOf,
  JSX,
  MountOptions,
  SlotFn,
  Slots,
} from './public-types'

export type {
  AppContext,
  BoundaryProps,
  Component,
  Context,
  ErrorInfo,
  EventMapOf,
  JSX,
  MountOptions,
  ParentProps,
  SlotFn,
  Slots,
} from './public-types'

// Reexportados do runtime sem mudança (18 §4: "inalterados, mapeados para os do runtime").
export { onMount } from './runtime/external'
export { onCleanup } from './runtime/owner'
export { useContext } from './runtime/props'
export { untrack, tick, abortSignal } from './runtime/reactive'
export { raw } from './runtime/proxy'

/** Marcador de compilação executado sem o compilador. */
function notCompiled(name: string, hint: string): never {
  throw jotasticError(
    'not-compiled',
    DEV ? `${name} só funciona compilado (${hint}); confira se o plugin do compilador processa este arquivo` : name,
  )
}

// ─── mount ───────────────────────────────────────────────────────────────────

/**
 * Monta a app em `target` (seletor ou Element). `el` é o thunk que o compilador gera para o JSX fora de corpo
 * reativo (18 §13), ou um valor já renderizado. Plugins rodam dentro do owner raiz antes de renderizar:
 * `app.provide` registra contexto no root, `app.onError` soma handlers ao `onError` das opções. Devolve `unmount`.
 */
export function mount(el: JSX.Element, target: Element | string, options: MountOptions = {}): () => void {
  const t = typeof target === 'string' ? document.querySelector(target) : target
  if (!t) throw jotasticError('mount-target-missing', `mount: alvo ${DEV ? `"${String(target)}" ` : ''}não encontrado`)

  const handlers: Array<(error: unknown, info: ErrorInfo) => void> = options.onError ? [options.onError] : []
  const dispatch = (error: unknown, info: ErrorInfo): void => {
    for (const h of handlers) h(error, info)
  }

  return createRoot(
    t,
    () => {
      const root = getOwner()!
      const plugins = options.plugins
      if (plugins && plugins.length) {
        const app: AppContext = {
          target: t,
          provide: (ctx, value) => runWithOwner(root, () => provide(ctx, () => value)),
          onError(handler) {
            handlers.push(handler)
            setOnError(root, dispatch)
          },
        }
        for (const plugin of plugins) plugin(app)
      }
      return (typeof el === 'function' ? el() : el) as Rendered
    },
    { onError: handlers.length ? dispatch : undefined },
  )
}

// ─── efeitos ─────────────────────────────────────────────────────────────────

/** Efeito de usuário com cleanup opcional (roda depois de montar). Compilado: `effect(fn, dev)`. */
export function watch(fn: () => void | (() => void)): void {
  effect(fn, { kind: 'user' })
}

/**
 * Listener removido no dispose do owner. Compilado, o alvo vira getter (`on(() => t, …)`) e re-liga quando muda;
 * chamado direto, o alvo é fixo (uma função também é aceita como getter).
 */
export function on<T extends EventTarget, K extends keyof EventMapOf<T>>(
  target: T | null | undefined,
  type: K,
  handler: (this: T, ev: EventMapOf<T>[K]) => unknown,
  options?: AddEventListenerOptions,
): void
export function on(
  target: EventTarget | null | undefined,
  type: string,
  handler: (ev: Event) => unknown,
  options?: AddEventListenerOptions,
): void
export function on(target: unknown, type: PropertyKey, handler: Function, options?: AddEventListenerOptions): void {
  const read = (typeof target === 'function' ? target : () => target) as () => EventTarget | null | undefined
  runtimeOn(read, String(type), handler as (e: Event) => unknown, options)
}

/**
 * Objeto com ciclo de vida. O dev vê `T`, mas o valor só existe depois de montar: as leituras precisam ser reescritas
 * pelo compilador (`x` → `x.get()`). Sem compilador não há como honrar o contrato → marcador.
 */
export function external<T>(_create: () => T, _update?: (value: T) => void, _destroy?: (value: T) => void): T {
  return notCompiled('external', 'use dentro do corpo de um componente ou função use*')
}

/** Dev: loga os valores a cada mudança (funções são lidas como getters). Compilado: `inspect(dev, () => a, …)`. */
export function inspect(...values: unknown[]): void {
  if (!DEV) return
  runtimeInspect({}, ...values.map((v) => (typeof v === 'function' ? (v as () => unknown) : () => v)))
}

// ─── async ───────────────────────────────────────────────────────────────────

function isResource(v: unknown): v is Resource<unknown> {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Resource<unknown>).refresh === 'function' &&
    typeof (v as Resource<unknown>).pending?.get === 'function'
  )
}

/** `true` enquanto o recurso de `value` recarrega. Compilado: `_rN.pending.get()`; sem compilador só aceita o `Resource`. */
export function pending(value: unknown): boolean {
  if (isResource(value)) return value.pending.get()
  return notCompiled('pending', 'o argumento deve ser uma variável vinda de `await` no corpo de um componente')
}

/** Reexecuta o recurso de `value`. Compilado: `_rN.refresh()`; sem compilador só aceita o `Resource`. */
export function refresh(value: unknown): void {
  if (isResource(value)) return value.refresh()
  notCompiled('refresh', 'o argumento deve ser uma variável vinda de `await` no corpo de um componente')
}

// ─── componentes embutidos ───────────────────────────────────────────────────

/** Fronteira de pending + erro. O compilador emite `component(Boundary, props)` (compiled/05-async-user-card.js). */
export function Boundary(props: BoundaryProps): JSX.Element {
  return boundary({
    pending: () => props.pending as Rendered,
    error: props.error as ((error: unknown, retry: () => void) => Rendered) | undefined,
    children: () => props.children as Rendered,
  }) as JSX.Element
}

/** Renderiza os filhos em `to` mantendo o owner de origem (contexto, erros). Não deixa nós no lugar de origem. */
export function Portal(props: { to: Element; children?: JSX.Element }): JSX.Element {
  return portal(
    () => props.to,
    () => props.children as Rendered,
  )
}

/** Marcador de slot: o compilador o transforma no objeto de slots dos children (18 §12). Nunca executa. */
export function Slot(_props: {
  name: string
  children?: JSX.Element | ((...args: any[]) => JSX.Element)
}): JSX.Element {
  return notCompiled('<Slot>', 'só é válido como filho direto de um componente')
}

/** Objeto de slots dos children. Compilado: `slots(props.children)`. */
export function useSlots<S extends Record<string, JSX.Element | SlotFn> = {}>(
  children: JSX.Element | undefined,
): Slots<S> {
  return slots(children) as unknown as Slots<S>
}

// ─── contexto ────────────────────────────────────────────────────────────────

/**
 * Contexto com `Provider`: componente que registra `value` no próprio owner e devolve os children. `value` é lido
 * como getter (I-3): o compilador passa `get value()`, e `provide` guarda um memo dele.
 */
export function createContext<T>(defaultValue?: T): Context<T> {
  const ctx = runtimeCreateContext<T>(defaultValue) as { -readonly [K in keyof Context<T>]: Context<T>[K] }
  ctx.Provider = function Provider(props: { value: T; children?: JSX.Element }): JSX.Element {
    provide(ctx, () => props.value)
    return props.children ?? null
  }
  return ctx
}
