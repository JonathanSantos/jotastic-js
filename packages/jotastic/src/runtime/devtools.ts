// Hook do devtools (ver docs/spec/contracts/devtools.d.ts).
// Custo zero sem o hook: quem emite checa `DEV && devtoolsHook()` antes de montar o objeto do evento.

import { DEV } from './env'
import type { Owner } from './owner'

export interface DevtoolsHook {
  emit(event: DevtoolsEvent): void
  registry: {
    owners: Map<number, Owner>
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
  | {
      type: 'dom:write'
      node: Node
      op: 'text' | 'attr' | 'prop' | 'class' | 'style' | 'insert' | 'remove' | 'move'
      detail?: string
      flush: number
    }
  | { type: 'flush:start'; flush: number; cause?: { signal: number } }
  | { type: 'flush:end'; flush: number; effects: number; writes: number; durationMs: number }
  | {
      type: 'resource:start' | 'resource:resolve' | 'resource:reject' | 'resource:abort'
      id: number
      owner: number
      version: number
      loc?: string
      durationMs?: number
    }
  | { type: 'store:action'; store: string; action: string; args: unknown[]; changed: string[] }
  | { type: 'list:recreated'; owner: number; loc?: string; count: number }
  | { type: 'error'; phase: string; owner: number; error: unknown; handledBy: 'boundary' | 'root' | 'console' }
  | { type: 'warn'; id: string; message: string; loc?: string }

/** Interno: o hook instalado, ou undefined. Use como guarda antes de montar eventos. */
export function devtoolsHook(): DevtoolsHook | undefined {
  return (globalThis as { __JOTASTIC_DEVTOOLS__?: DevtoolsHook }).__JOTASTIC_DEVTOOLS__
}

/** Emite um evento se o hook existir; no-op caso contrário. */
export function emitDevtools(event: DevtoolsEvent): void {
  const hook = devtoolsHook()
  if (hook) hook.emit(event)
}

/**
 * Interno: contadores do flush corrente. `flush` é o id do último flush iniciado (o scheduler incrementa);
 * `effects`/`writes` são zerados no início de cada flush e reportados em `flush:end`.
 */
export const stats = { flush: 0, effects: 0, writes: 0 }

/** Interno (para `dom.ts`): registra uma escrita no DOM (conta para `flush:end` e emite `dom:write`). */
export function emitDomWrite(
  node: Node,
  op: 'text' | 'attr' | 'prop' | 'class' | 'style' | 'insert' | 'remove' | 'move',
  detail?: string,
): void {
  if (!DEV) return
  stats.writes++
  const hook = devtoolsHook()
  if (hook) hook.emit({ type: 'dom:write', node, op, detail, flush: stats.flush })
}

/** Interno: aviso de runtime em dev (diagnóstico de 12-diagnosticos.md): `console.warn` + evento `warn`. */
export function warn(id: string, message: string, loc?: string): void {
  if (!DEV) return
  console.warn(`[jotastic] ${id}: ${message}${loc ? ` (${loc})` : ''}`)
  const hook = devtoolsHook()
  if (hook) hook.emit({ type: 'warn', id, message, loc })
}
