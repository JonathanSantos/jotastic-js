// Contadores de execução por flush (efeitos, memos, escritas), atualizados em `flush:end` e mostrados num badge
// no canto da página. Alt+J alterna mostrar/esconder (docs/spec/13-tooling.md §Devtools).

import type { JotasticDevtoolsHook } from './hook'
import { acquireUI } from './ui'

export interface FlushStats {
  flush: number
  effects: number
  memos: number
  writes: number
  durationMs: number
}

export interface CountersOptions {
  /** Badge visível ao instalar. Padrão: true. */
  visible?: boolean
}

export interface Counters {
  /** Último flush concluído (ou undefined antes do primeiro). */
  readonly last: FlushStats | undefined
  /** Somatório desde a instalação. */
  readonly total: { flushes: number; effects: number; memos: number; writes: number }
  readonly badge: HTMLElement
  readonly visible: boolean
  toggle(force?: boolean): void
  dispose(): void
}

function format(last: FlushStats | undefined, total: Counters['total']): string {
  if (!last) return 'jotastic · aguardando flush'
  const ms = last.durationMs < 1 ? last.durationMs.toFixed(2) : last.durationMs.toFixed(1)
  return (
    `flush #${last.flush} · ${last.effects} efeitos · ${last.memos} memos · ${last.writes} escritas · ${ms} ms\n` +
    `total: ${total.flushes} flushes · ${total.effects} efeitos · ${total.memos} memos · ${total.writes} escritas`
  )
}

export function createCounters(hook: JotasticDevtoolsHook, options: CountersOptions = {}): Counters {
  const ui = acquireUI()
  const badge = document.createElement('div')
  badge.className = 'badge'
  badge.hidden = options.visible === false
  ui.root.appendChild(badge)

  const total = { flushes: 0, effects: 0, memos: 0, writes: 0 }
  let last: FlushStats | undefined
  // `flush:end` traz efeitos e escritas; memos são contados pelos `memo:run` desde o `flush:start`.
  let memos = 0

  const render = () => {
    badge.textContent = format(last, total)
  }
  render()

  const unsubscribe = hook.subscribe((event) => {
    switch (event.type) {
      case 'flush:start':
        memos = 0
        break
      case 'memo:run':
        memos++
        break
      case 'flush:end':
        last = { flush: event.flush, effects: event.effects, memos, writes: event.writes, durationMs: event.durationMs }
        total.flushes++
        total.effects += event.effects
        total.memos += memos
        total.writes += event.writes
        memos = 0
        render()
        break
    }
  })

  const toggle = (force?: boolean) => {
    badge.hidden = force === undefined ? !badge.hidden : !force
  }
  const onKey = (e: KeyboardEvent) => {
    // `code`, não `key`: no macOS Alt+J produz "∆".
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyJ' || e.key === 'j' || e.key === 'J')) {
      e.preventDefault()
      toggle()
    }
  }
  window.addEventListener('keydown', onKey)

  return {
    get last() {
      return last
    },
    total,
    badge,
    get visible() {
      return !badge.hidden
    },
    toggle,
    dispose() {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
      badge.remove()
      ui.dispose()
    },
  }
}
