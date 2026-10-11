// Utilitário de teste: registra eventos do devtools (por cima do hook do @jotastic/test).
import type { DevtoolsEvent, DevtoolsHook } from 'jotastic/runtime'
import { counts } from '@jotastic/test'

type Global = { __JOTASTIC_DEVTOOLS__?: DevtoolsHook }

export interface Trace {
  events: DevtoolsEvent[]
  /** Nomes dos memos recomputados (memos sem nome viram `#id`). */
  memos(): string[]
  /** Escritas no DOM como `op:tag[.detail]`. */
  writes(): string[]
  clear(): void
  stop(): void
}

export function trace(): Trace {
  counts() // garante o hook do @jotastic/test instalado
  // Embrulha o `emit` do hook atual no lugar (trocar o global faria o @jotastic/test reinstalar e contar em dobro).
  const hook = (globalThis as Global).__JOTASTIC_DEVTOOLS__!
  const original = hook.emit
  const names = new Map<number, string>()
  const events: DevtoolsEvent[] = []
  hook.emit = (e) => {
    if (e.type === 'memo:create') names.set(e.id, e.name ?? `#${e.id}`)
    events.push(e)
    original.call(hook, e)
  }
  return {
    events,
    memos: () => events.flatMap((e) => (e.type === 'memo:run' ? [names.get(e.id) ?? `#${e.id}`] : [])),
    writes: () =>
      events.flatMap((e) =>
        e.type === 'dom:write'
          ? [
              `${e.op}:${(e.node as Element).tagName?.toLowerCase() ?? e.node.nodeName}${e.detail ? '.' + e.detail : ''}`,
            ]
          : [],
      ),
    clear: () => void (events.length = 0),
    stop: () => {
      hook.emit = original
    },
  }
}
