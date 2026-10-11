// Container da UI do devtools: um host fixo com Shadow DOM, para não herdar nem vazar estilos da página.

const HOST_ID = '__jotastic_devtools__'

const STYLE = `
:host { all: initial; }
.flash {
  position: fixed;
  pointer-events: none;
  box-sizing: border-box;
  border: 2px solid var(--c, #f5a524);
  background: color-mix(in srgb, var(--c, #f5a524) 12%, transparent);
  border-radius: 2px;
  z-index: 2147483646;
  animation: jo-flash var(--d, 300ms) ease-out forwards;
}
@keyframes jo-flash {
  from { opacity: 1; }
  to { opacity: 0; }
}
.badge {
  position: fixed;
  right: 8px;
  bottom: 8px;
  z-index: 2147483647;
  pointer-events: none;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #f4f4f5;
  background: rgba(24, 24, 27, 0.88);
  padding: 4px 8px;
  border-radius: 6px;
  white-space: pre;
}
.badge[hidden] { display: none; }
`

export interface DevtoolsUI {
  host: HTMLElement
  root: ShadowRoot
  dispose(): void
}

let ui: DevtoolsUI | undefined
let users = 0

/** Obtém (criando na primeira vez) o container compartilhado; cada `acquireUI` pede um `dispose`. */
export function acquireUI(): DevtoolsUI {
  users++
  if (ui && ui.host.isConnected) return ui
  const host = document.createElement('div')
  host.id = HOST_ID
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLE
  root.appendChild(style)
  document.documentElement.appendChild(host)
  const created: DevtoolsUI = {
    host,
    root,
    dispose() {
      if (--users > 0) return
      users = 0
      host.remove()
      if (ui === created) ui = undefined
    },
  }
  ui = created
  return created
}
