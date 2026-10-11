// @jotastic/test: render + tick + contador de execuções (ver docs/spec/13-tooling.md §Testes e 19-plano-de-testes.md).

import { createRoot, type DevMeta, type DevtoolsEvent, type DevtoolsHook, type ErrorInfo } from 'jotastic/runtime'

export { tick } from 'jotastic/runtime'

/** Contagem de execuções desde o último `resetCounts()`. */
export interface Counts {
  /** Execuções de efeitos (bindings de render + `effect` do usuário). */
  effects: number
  /** Recomputações de memos. */
  memos: number
  /** Escritas no DOM feitas pelo runtime. */
  writes: number
}

export interface RenderOptions {
  /** Onde o container é anexado. Padrão: `document.body`. */
  target?: Element
  /** `onError` do root. Sem ele, erros não tratados RELANÇAM (o teste falha). */
  onError?: (error: unknown, info: ErrorInfo) => void
  dev?: DevMeta
}

export interface RenderResult {
  container: HTMLElement
  unmount: () => void
}

// --- Hook de devtools (modo teste) ---

const counters: Counts = { effects: 0, memos: 0, writes: 0 }

type Global = { __JOTASTIC_DEVTOOLS__?: DevtoolsHook }
const g = globalThis as Global

let installed: DevtoolsHook | undefined

function onEvent(event: DevtoolsEvent): void {
  switch (event.type) {
    case 'effect:run':
      counters.effects++
      break
    case 'memo:run':
      counters.memos++
      break
    case 'dom:write':
      counters.writes++
      break
    case 'error':
      // Root sem `onError` e nenhuma fronteira tratou: relança para o teste falhar (17-contratos.md §Erros).
      // `handleError` emite este evento antes de cair no `console.error`, então lançar aqui equivale a
      // `setRethrowUnhandled(true)`, que não é exportado por `jotastic/runtime`.
      if (event.handledBy === 'console') throw event.error
      break
  }
}

/**
 * Instala (ou reinstala, se alguém trocou o global) o hook que alimenta `counts()`.
 * Encadeia com um hook pré-existente: os eventos seguem para ele e o `registry` é compartilhado.
 * O runtime lê o global a cada emissão, então instalar a qualquer momento basta.
 */
function ensureHook(): void {
  const current = g.__JOTASTIC_DEVTOOLS__
  if (current && current === installed) return
  const prev = current
  installed = {
    emit(event) {
      onEvent(event)
      if (prev) prev.emit(event)
    },
    registry: prev ? prev.registry : { owners: new Map() },
  }
  g.__JOTASTIC_DEVTOOLS__ = installed
}

ensureHook()

/** `{ effects, memos, writes }` desde o último `resetCounts()`. */
export function counts(): Counts {
  ensureHook()
  return { ...counters }
}

/** Zera os contadores de `counts()`. */
export function resetCounts(): void {
  ensureHook()
  counters.effects = 0
  counters.memos = 0
  counters.writes = 0
}

// --- render / cleanup ---

const mounted = new Set<() => void>()

/**
 * Monta em um container novo (anexado a `document.body`). Aceita o thunk que o compilador gera para JSX
 * fora de corpo reativo (`() => component(...)`) ou um valor já renderizado.
 */
export function render(thunkOrRendered: unknown, opts?: RenderOptions): RenderResult {
  ensureHook()
  const container = document.createElement('div')
  ;(opts?.target ?? document.body).appendChild(container)
  const thunk = typeof thunkOrRendered === 'function' ? (thunkOrRendered as () => unknown) : () => thunkOrRendered
  let dispose: (() => void) | undefined
  const unmount = () => {
    if (!mounted.delete(unmount)) return
    if (dispose) dispose()
    container.remove()
  }
  mounted.add(unmount)
  try {
    dispose = createRoot(container, thunk, { onError: opts?.onError, dev: opts?.dev })
  } catch (e) {
    unmount()
    throw e
  }
  return { container, unmount }
}

/** Desmonta tudo que `render` montou e ainda está vivo (use em `afterEach`). */
export function cleanup(): void {
  for (const unmount of [...mounted]) unmount()
}
