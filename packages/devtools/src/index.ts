// @jotastic/devtools: overlay de flash nos nós atualizados + contadores de execução por flush
// (docs/spec/13-tooling.md §Devtools, fase "Logo após o M3"). Só em dev: o build de prod do runtime não emite eventos.
// Nada roda até `installDevtools()` ser chamado.

import { createCounters, type Counters, type CountersOptions } from './counters'
import { createFlashOverlay, type FlashOptions, type FlashOverlay } from './flash'
import { installHook, type JotasticDevtoolsHook } from './hook'

export { installHook } from './hook'
export type { DevtoolsListener, JotasticDevtoolsHook } from './hook'
export { createFlashOverlay, rectOf } from './flash'
export type { FlashOptions, FlashOverlay } from './flash'
export { createCounters } from './counters'
export type { Counters, CountersOptions, FlushStats } from './counters'

export interface DevtoolsOptions {
  /** Overlay de flash nos nós escritos. Padrão: true. */
  flash?: boolean | FlashOptions
  /** Badge de contadores. Padrão: true. */
  counters?: boolean | CountersOptions
}

export interface Devtools {
  hook: JotasticDevtoolsHook
  flash: FlashOverlay | undefined
  counters: Counters | undefined
  /** Remove overlay e badge. O hook global continua instalado (outros podem ter encadeado nele). */
  dispose(): void
}

let instance: Devtools | undefined

/** Instala o hook global, o overlay de flash e o badge de contadores. Idempotente: a 2ª chamada devolve a 1ª. */
export function installDevtools(options: DevtoolsOptions = {}): Devtools {
  if (instance) return instance
  const hook = installHook()
  if (typeof document === 'undefined') {
    instance = { hook, flash: undefined, counters: undefined, dispose: () => (instance = undefined) }
    return instance
  }
  const flash =
    options.flash === false ? undefined : createFlashOverlay(hook, options.flash === true ? {} : options.flash)
  const counters =
    options.counters === false ? undefined : createCounters(hook, options.counters === true ? {} : options.counters)
  const created: Devtools = {
    hook,
    flash,
    counters,
    dispose() {
      flash?.dispose()
      counters?.dispose()
      if (instance === created) instance = undefined
    },
  }
  instance = created
  return created
}
