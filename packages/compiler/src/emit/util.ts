/** Utilitários de AST da emissão. */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'

/** `a.b` com `b` identificador válido, senão `a['b']`. */
export function member(object: t.Expression, key: string): t.MemberExpression {
  return t.isValidIdentifier(key)
    ? t.memberExpression(object, t.identifier(key))
    : t.memberExpression(object, t.stringLiteral(key), true)
}

/** Chave de propriedade de objeto: identificador quando possível. */
export function propKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}

/** `obj.method(...args)` */
export function callMethod(object: t.Expression, method: string, args: t.Expression[] = []): t.CallExpression {
  return t.callExpression(t.memberExpression(object, t.identifier(method)), args)
}

export function arrow(body: t.Expression | t.BlockStatement, params: t.Identifier[] = []): t.ArrowFunctionExpression {
  return t.arrowFunctionExpression(params, body)
}

/** `get key() { return value }` */
export function getter(key: string, value: t.Expression | t.Statement[]): t.ObjectMethod {
  const body = Array.isArray(value) ? value : [t.returnStatement(value)]
  return t.objectMethod('get', propKey(key), [], t.blockStatement(body))
}

/**
 * Percorre `node` em pré-ordem sem entrar em funções aninhadas (o próprio `node` pode ser função).
 * `enter` devolvendo `false` não desce.
 */
export function walk(node: t.Node, enter: (n: t.Node) => boolean | void): void {
  const visit = (n: t.Node, root: boolean): void => {
    if (!root && t.isFunction(n)) return
    if (enter(n) === false) return
    for (const key of t.VISITOR_KEYS[n.type] ?? []) {
      const child = (n as unknown as Record<string, unknown>)[key]
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c === 'object' && 'type' in c) visit(c as t.Node, false)
      } else if (child && typeof child === 'object' && 'type' in child) visit(child as t.Node, false)
    }
  }
  visit(node, true)
}

export function some(node: t.Node, pred: (n: t.Node) => boolean): boolean {
  let found = false
  walk(node, (n) => {
    if (found) return false
    if (pred(n)) {
      found = true
      return false
    }
  })
  return found
}

export function isJSX(n: t.Node): n is t.JSXElement | t.JSXFragment {
  return t.isJSXElement(n) || t.isJSXFragment(n)
}

/** Literal cujo valor é conhecido em build (string, número, boolean, null, `undefined`, template sem expressões). */
export function isLiteralValue(n: t.Node): boolean {
  return (
    t.isStringLiteral(n) ||
    t.isNumericLiteral(n) ||
    t.isBooleanLiteral(n) ||
    t.isNullLiteral(n) ||
    t.isBigIntLiteral(n) ||
    (t.isTemplateLiteral(n) && n.expressions.length === 0) ||
    (t.isIdentifier(n) && n.name === 'undefined') ||
    (t.isUnaryExpression(n) && n.operator === '-' && t.isNumericLiteral(n.argument))
  )
}

/** Valor JS de um literal (`isLiteralValue`). */
export function literalValue(n: t.Node): string | number | boolean | null | undefined | bigint {
  if (t.isStringLiteral(n) || t.isNumericLiteral(n) || t.isBooleanLiteral(n)) return n.value
  if (t.isBigIntLiteral(n)) return BigInt(n.value)
  if (t.isNullLiteral(n)) return null
  if (t.isTemplateLiteral(n)) return n.quasis[0]?.value.cooked ?? ''
  if (t.isUnaryExpression(n) && t.isNumericLiteral(n.argument)) return -n.argument.value
  return undefined
}

/**
 * "Expressão com leituras reativas ou qualquer chamada/membro" (18 §6). Depois da reescrita de §4 toda leitura
 * reativa já é chamada (`x.get()`) ou membro (`props.x`), então basta procurar essas formas fora de funções.
 */
export function isDynamic(n: t.Node): boolean {
  if (t.isFunction(n)) return false
  return some(
    n,
    (x) =>
      t.isCallExpression(x) ||
      t.isOptionalCallExpression(x) ||
      t.isMemberExpression(x) ||
      t.isOptionalMemberExpression(x) ||
      t.isNewExpression(x) ||
      t.isTaggedTemplateExpression(x) ||
      t.isThisExpression(x) ||
      t.isAwaitExpression(x) ||
      t.isYieldExpression(x) ||
      isJSX(x),
  )
}

/** Nome JSX (`div`, `Tabs.Tab`, `on:x`) como texto. */
export function jsxName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) return name.name
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`
  return `${jsxName(name.object)}.${name.property.name}`
}

export function attrName(attr: t.JSXAttribute): string {
  return t.isJSXNamespacedName(attr.name) ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name
}

/** Elemento intrínseco (`div`, `my-el`) vs componente (`Comp`, `a.b`). */
export function isIntrinsic(name: t.JSXOpeningElement['name']): boolean {
  return t.isJSXIdentifier(name) ? /^[a-z]/.test(name.name) : t.isJSXNamespacedName(name)
}

/** Raiz de uma cadeia de membros (`a.b.c` → `a`). */
export function memberRoot(node: t.Node): t.Node {
  let n = node
  while (t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) n = n.object
  return n
}

/** Nome de importação de `source` a que o identificador se refere (`import { watch as w }` → `watch`), ou null. */
export function importedName(path: NodePath, name: string, source = 'jotastic'): string | null {
  const binding = path.scope.getBinding(name)
  if (!binding || binding.kind !== 'module') return null
  const decl = binding.path.parent
  const spec = binding.path.node
  if (!t.isImportDeclaration(decl) || decl.source.value !== source || !t.isImportSpecifier(spec)) return null
  return t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
}

export function isUseName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name)
}
