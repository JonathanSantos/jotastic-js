/**
 * Eventos emitidos pelo runtime em dev via `globalThis.__JOTASTIC_DEVTOOLS__.emit(event)`.
 * Em prod o compilador remove as chamadas e o objeto não existe.
 */

export interface DevtoolsHook {
  emit(event: DevtoolsEvent): void
  /** Permite ao painel ler o estado atual (owners, signals) sob demanda. */
  registry: {
    owners: Map<number, import('./runtime').Owner>
  }
}

export type DevtoolsEvent =
  | { type: 'owner:create'; id: number; parent: number | null; kind: string; name?: string; loc?: string }
  | { type: 'owner:dispose'; id: number }
  | { type: 'signal:create'; id: number; owner: number | null; name?: string; loc?: string; value: unknown }
  | { type: 'signal:set'; id: number; prev: unknown; next: unknown; flush: number }
  | { type: 'memo:create'; id: number; owner: number | null; name?: string; loc?: string; constant: boolean }
  | { type: 'memo:run'; id: number; prev: unknown; next: unknown; changed: boolean; flush: number }
  | { type: 'effect:create'; id: number; owner: number | null; kind: 'render' | 'user'; name?: string; loc?: string }
  | { type: 'effect:run'; id: number; durationMs: number; flush: number }
  | { type: 'dom:write'; node: Node; op: 'text' | 'attr' | 'prop' | 'class' | 'style' | 'insert' | 'remove' | 'move'; detail?: string; flush: number }
  | { type: 'flush:start'; flush: number; cause?: { signal: number } }
  | { type: 'flush:end'; flush: number; effects: number; writes: number; durationMs: number }
  | { type: 'resource:start' | 'resource:resolve' | 'resource:reject' | 'resource:abort'; id: number; owner: number; version: number; loc?: string; durationMs?: number }
  | { type: 'store:action'; store: string; action: string; args: unknown[]; changed: string[] }
  | { type: 'list:recreated'; owner: number; loc?: string; count: number }
  | { type: 'error'; phase: string; owner: number; error: unknown; handledBy: 'boundary' | 'root' | 'console' }
  | { type: 'warn'; id: string; message: string; loc?: string }
