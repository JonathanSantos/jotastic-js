// Overlay de flash: ouve `dom:write` e desenha um retângulo sobre o nó escrito, que some em `duration` ms.
// Vários writes no mesmo nó no mesmo frame viram um retângulo só.

import type { DevtoolsEvent } from 'jotastic/runtime'
import type { JotasticDevtoolsHook } from './hook'
import { acquireUI } from './ui'

type WriteOp = Extract<DevtoolsEvent, { type: 'dom:write' }>['op']

export interface FlashOptions {
  /** Tempo até o retângulo sumir. Padrão: 300 ms. */
  duration?: number
}

export interface FlashOverlay {
  dispose(): void
}

/** Escritas de conteúdo/atributo em âmbar; mudanças estruturais (insert/remove/move) em azul. */
const COLOR_UPDATE = '#f5a524'
const COLOR_STRUCTURE = '#3b82f6'

function colorFor(ops: Set<WriteOp>): string {
  for (const op of ops) if (op !== 'insert' && op !== 'remove' && op !== 'move') return COLOR_UPDATE
  return COLOR_STRUCTURE
}

/** Retângulo do nó na viewport: Element direto, Text via `Range`; outros nós (comentário, fragmento) não têm. */
export function rectOf(node: Node): DOMRect | undefined {
  if (!node.isConnected) return undefined
  if (node.nodeType === 1) return (node as Element).getBoundingClientRect()
  if (node.nodeType === 3) {
    const range = document.createRange()
    range.selectNodeContents(node)
    return range.getBoundingClientRect()
  }
  return undefined
}

const nextFrame: (cb: () => void) => void =
  typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16)

export function createFlashOverlay(hook: JotasticDevtoolsHook, options: FlashOptions = {}): FlashOverlay {
  const duration = options.duration ?? 300
  const ui = acquireUI()
  const pending = new Map<Node, Set<WriteOp>>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let scheduled = false
  let disposed = false

  function draw(): void {
    scheduled = false
    if (disposed) return
    for (const [node, ops] of pending) {
      const rect = rectOf(node)
      if (!rect) continue
      const el = document.createElement('div')
      el.className = 'flash'
      el.dataset.op = [...ops].join(' ')
      el.style.cssText =
        `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;` +
        `--c:${colorFor(ops)};--d:${duration}ms`
      ui.root.appendChild(el)
      const t = setTimeout(() => {
        timers.delete(t)
        el.remove()
      }, duration)
      timers.add(t)
    }
    pending.clear()
  }

  const unsubscribe = hook.subscribe((event) => {
    if (event.type !== 'dom:write') return
    // Escritas dentro do próprio devtools não piscam (não deveriam existir, mas evita laço).
    if (ui.host.contains(event.node) || event.node.getRootNode() === ui.root) return
    let ops = pending.get(event.node)
    if (!ops) pending.set(event.node, (ops = new Set()))
    ops.add(event.op)
    if (!scheduled) {
      scheduled = true
      nextFrame(draw)
    }
  })

  return {
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      for (const t of timers) clearTimeout(t)
      timers.clear()
      pending.clear()
      for (const el of ui.root.querySelectorAll('.flash')) el.remove()
      ui.dispose()
    },
  }
}
