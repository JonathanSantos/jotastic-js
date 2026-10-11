// Contorno para bug do happy-dom 15: `HTMLFormElement` é um Proxy, mas os getters herdados de `Node` rodam com `this`
// = alvo cru, e `parent.childNodes` guarda o Proxy. Resultado: `form.nextSibling`/`form.previousSibling` → null.
// Quebra a navegação `firstChild`/`nextSibling` da saída compilada (ex.: 02-todos: `_form.nextSibling`).
// Corrigido no happy-dom 20 (verificado); remover este arquivo ao atualizar.

const token = Symbol('happy-dom-form-token')

function siblingOf(self: Node, offset: 1 | -1): Node | null {
  const parent = self.parentNode
  if (!parent) return null
  const mark = {}
  ;(self as unknown as Record<symbol, unknown>)[token] = mark
  const nodes = Array.from(parent.childNodes)
  // Pelo Proxy, símbolos são lidos do alvo: o nó cuja marca é `mark` é o próprio `self`.
  const i = nodes.findIndex((n) => n === self || (n as unknown as Record<symbol, unknown>)[token] === mark)
  return i < 0 ? null : (nodes[i + offset] ?? null)
}

for (const [name, offset] of [
  ['nextSibling', 1],
  ['previousSibling', -1],
] as const) {
  const desc = Object.getOwnPropertyDescriptor(Node.prototype, name)
  if (!desc?.get) continue
  const original = desc.get
  Object.defineProperty(Node.prototype, name, {
    ...desc,
    get(this: Node) {
      const r = original.call(this)
      if (r === null && (this as Element).tagName === 'FORM') return siblingOf(this, offset)
      return r
    },
  })
}
