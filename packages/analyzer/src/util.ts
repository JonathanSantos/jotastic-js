import * as t from '@babel/types'
import _traverse from '@babel/traverse'
import type { Binding, NodePath } from '@babel/traverse'

/** `@babel/traverse` é CJS: o default pode vir embrulhado conforme o loader. */
export const traverse: typeof _traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse

/** Remove embrulhos que não mudam o valor: parênteses e asserções de tipo do TS. */
export function unwrap(node: t.Node): t.Node {
  let n = node
  for (;;) {
    if (
      t.isParenthesizedExpression(n) ||
      t.isTSAsExpression(n) ||
      t.isTSSatisfiesExpression(n) ||
      t.isTSNonNullExpression(n) ||
      t.isTSTypeAssertion(n) ||
      t.isTSInstantiationExpression(n)
    ) {
      n = n.expression
    } else return n
  }
}

export function isFunctionNode(node: t.Node | null | undefined): node is t.Function {
  return !!node && t.isFunction(node)
}

/**
 * Percorre `node` em pré-ordem. `enter` devolvendo `false` não desce nos filhos.
 * Por padrão não entra em funções aninhadas (o próprio `node` pode ser uma função).
 */
export function walk(
  node: t.Node,
  enter: (n: t.Node, parent: t.Node | null) => boolean | void,
  opts: { functions?: boolean } = {},
): void {
  const visit = (n: t.Node, parent: t.Node | null): void => {
    if (parent && !opts.functions && t.isFunction(n)) return
    if (enter(n, parent) === false) return
    const keys = t.VISITOR_KEYS[n.type] ?? []
    for (const key of keys) {
      const child = (n as unknown as Record<string, unknown>)[key]
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c === 'object' && 'type' in c) visit(c as t.Node, n)
      } else if (child && typeof child === 'object' && 'type' in child) visit(child as t.Node, n)
    }
  }
  visit(node, null)
}

export function containsNode(node: t.Node, pred: (n: t.Node) => boolean, opts: { functions?: boolean } = {}): boolean {
  let found = false
  walk(
    node,
    (n) => {
      if (found) return false
      if (pred(n)) {
        found = true
        return false
      }
    },
    opts,
  )
  return found
}

export function isJSXNode(n: t.Node): n is t.JSXElement | t.JSXFragment {
  return t.isJSXElement(n) || t.isJSXFragment(n)
}

export function containsJSX(node: t.Node, functions = true): boolean {
  return containsNode(node, isJSXNode, { functions })
}

export function findAwaits(node: t.Node): t.AwaitExpression[] {
  const out: t.AwaitExpression[] = []
  if (t.isFunction(node)) return out
  walk(node, (n) => {
    if (t.isAwaitExpression(n)) out.push(n)
  })
  return out
}

/** `a` contém `b` (por posição no fonte). */
export function within(inner: t.Node, outer: t.Node): boolean {
  return inner.start != null && outer.start != null && inner.start >= outer.start && inner.end! <= outer.end!
}

/** Algum ancestral de `p` (exclusive) até `stop` (exclusive) satisfaz `pred`. */
export function hasAncestorBetween(p: NodePath, stop: t.Node, pred: (a: NodePath) => boolean): boolean {
  let cur = p.parentPath
  while (cur && cur.node !== stop) {
    if (pred(cur)) return true
    cur = cur.parentPath
  }
  return false
}

/** Nome de importação de `jotastic` (ou de outro módulo) a que o identificador se refere, ou null. */
export function importedName(scopePath: NodePath, name: string, source = 'jotastic'): string | null {
  const binding = scopePath.scope.getBinding(name)
  if (!binding || binding.kind !== 'module') return null
  const spec = binding.path.node
  const decl = binding.path.parent
  if (!t.isImportDeclaration(decl) || decl.source.value !== source) return null
  if (t.isImportSpecifier(spec)) return t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
  return null
}

/** Nome da API de `jotastic` chamada (`watch`, `on`, `external`…), ou null. */
export function jotasticCallee(call: NodePath<t.CallExpression>): string | null {
  const callee = call.node.callee
  if (!t.isIdentifier(callee)) return null
  return importedName(call, callee.name)
}

export function isUseName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name)
}

export function isUseCall(node: t.Node): node is t.CallExpression {
  const n = unwrap(node)
  return t.isCallExpression(n) && t.isIdentifier(n.callee) && isUseName(n.callee.name)
}

export function isImportBinding(binding: Binding | undefined): boolean {
  return !!binding && binding.kind === 'module'
}

/** Identificador na raiz de uma cadeia de membros (`a.b.c` → `a`, `a?.b` → `a`). */
export function memberRoot(node: t.Node): t.Node {
  let n = unwrap(node)
  while (t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) n = unwrap(n.object)
  return n
}

export function toLoc(node: t.Node): { line: number; column: number; endLine: number; endColumn: number } {
  const loc = node.loc
  if (!loc) return { line: 0, column: 0, endLine: 0, endColumn: 0 }
  return { line: loc.start.line, column: loc.start.column + 1, endLine: loc.end.line, endColumn: loc.end.column + 1 }
}

export function jsxName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) return name.name
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`
  return `${jsxName(name.object as t.JSXOpeningElement['name'])}.${name.property.name}`
}

export function attrName(attr: t.JSXAttribute): string {
  return t.isJSXNamespacedName(attr.name) ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name
}

/** Elemento intrínseco (`div`, `my-el`) vs componente (`Comp`, `a.b`). */
export function isIntrinsic(name: t.JSXOpeningElement['name']): boolean {
  return t.isJSXIdentifier(name) ? /^[a-z]/.test(name.name) : t.isJSXNamespacedName(name)
}

export function findAttr(el: t.JSXOpeningElement, name: string): t.JSXAttribute | undefined {
  for (const a of el.attributes) if (t.isJSXAttribute(a) && attrName(a) === name) return a
  return undefined
}
