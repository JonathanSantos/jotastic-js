/** Módulo `jotastic/store` para o typecheck dos exemplos (contrato: `docs/spec/contracts/jotastic.d.ts`). */
import type { SetFn, Store } from '../../src/public-types.js'

export type { DeepReadonly, SetFn, Store } from '../../src/public-types.js'

export declare function createStore<S extends object>(
  factory: (set: SetFn<S>, get: () => S) => S,
  options?: { name?: string },
): Store<S>
