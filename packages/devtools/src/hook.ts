// Hook global do devtools (docs/spec/contracts/devtools.d.ts): `globalThis.__JOTASTIC_DEVTOOLS__`.
// O runtime lê o global a cada emissão; instalar a qualquer momento basta. Sem hook instalado, custo zero.

import type { DevtoolsEvent, DevtoolsHook } from 'jotastic/runtime'

export type { DevtoolsEvent, DevtoolsHook }

export type DevtoolsListener = (event: DevtoolsEvent) => void

/** Hook instalado por este pacote: o contrato + assinantes. */
export interface JotasticDevtoolsHook extends DevtoolsHook {
  /** Assina todos os eventos; devolve a função que cancela a assinatura. */
  subscribe(listener: DevtoolsListener): () => void
}

type Global = { __JOTASTIC_DEVTOOLS__?: DevtoolsHook }
const g = globalThis as Global

/** Marca do hook deste pacote (sobrevive a duas cópias do módulo na página). */
const MARK = Symbol.for('jotastic.devtools.hook')

function isOurs(hook: DevtoolsHook | undefined): hook is JotasticDevtoolsHook {
  return !!hook && (hook as unknown as Record<symbol, unknown>)[MARK] === true
}

let installed: JotasticDevtoolsHook | undefined

/**
 * Instala o hook global (idempotente). Encadeia com um hook pré-existente (ex.: `@jotastic/test`): os eventos
 * seguem para ele e o `registry` é compartilhado. Se outro hook encadeou por cima do nosso depois, o nosso
 * continua recebendo os eventos por ele e é reaproveitado.
 */
export function installHook(): JotasticDevtoolsHook {
  const current = g.__JOTASTIC_DEVTOOLS__
  if (isOurs(current)) return (installed = current)
  if (installed) return installed
  const prev = current
  const listeners = new Set<DevtoolsListener>()
  const hook: JotasticDevtoolsHook = {
    emit(event) {
      for (const l of listeners) {
        try {
          l(event)
        } catch (e) {
          // Um assinante com defeito não pode quebrar o runtime nem os outros assinantes.
          console.error('[jotastic devtools]', e)
        }
      }
      if (prev) prev.emit(event)
    },
    registry: prev ? prev.registry : { owners: new Map() },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  Object.defineProperty(hook, MARK, { value: true })
  installed = hook
  g.__JOTASTIC_DEVTOOLS__ = hook
  return hook
}
