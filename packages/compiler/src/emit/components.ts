/**
 * Componentes no JSX (18 §6): `component(Comp, props, dev)`, props estáticas como valores e dinâmicas como getters,
 * `mergeProps` para spread, `keyed` para `key`, `children`. Slots (§12) são da parte 2 (gancho em `children`).
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { BodyContext } from '../context'
import { childrenOf, type Child } from './template'
import { childValue } from './flow'
import { arrow, attrName, getter, isDynamic, isJSX, isLiteralValue, jsxName, propKey } from './util'

/** `Comp`, `Tabs.Tab`, `props.as`: expressão do componente, com a reescrita de §4 (prop desestruturada `As`). */
function calleeOf(path: NodePath<t.JSXElement>, ctx: BodyContext): t.Expression {
  const toExpr = (n: t.JSXOpeningElement['name']): t.Expression => {
    if (t.isJSXIdentifier(n)) {
      if (n.name === 'this') return t.thisExpression()
      const rule = ctx.ruleFor(path, n.name)
      return rule ? rule.read() : t.identifier(n.name)
    }
    if (t.isJSXMemberExpression(n)) return t.memberExpression(toExpr(n.object), t.identifier(n.property.name))
    return ctx.mod.error(n, 'jsx-namespaced-component', `\`<${jsxName(n)}>\` não é um nome de componente válido.`)
  }
  return toExpr(path.node.openingElement.name)
}

/** Valor de uma prop (18 §6): literal/função → valor; JSX ou leitura dinâmica → getter. */
function propEntry(key: string, value: t.Expression): t.ObjectProperty | t.ObjectMethod {
  if (isJSX(value) || (!isLiteralValue(value) && !t.isFunction(value) && isDynamic(value))) return getter(key, value)
  const shorthand = t.isIdentifier(value) && value.name === key
  return t.objectProperty(propKey(key), value, false, shorthand)
}

function isSlot(c: Child): c is Extract<Child, { kind: 'component' }> {
  return c.kind === 'component' && jsxName(c.path.node.openingElement.name) === 'Slot'
}

/** `children` do componente (18 §6): um filho → getter/valor; vários → getter com array. */
function childrenEntry(path: NodePath<t.JSXElement>, ctx: BodyContext): t.ObjectProperty | t.ObjectMethod | null {
  const children = childrenOf(path, ctx)
  if (children.length === 0) return null
  // gancho: slots (18 §12) — a parte 2 monta `{ [SLOTS]: true, default, … }` aqui
  const slot = children.find(isSlot)
  if (slot) return ctx.mod.notImplemented(slot.path.node, '`<Slot>` (slots)')
  if (children.length === 1) {
    const c = children[0]!
    if (c.kind === 'text') return t.objectProperty(t.identifier('children'), t.stringLiteral(c.value))
    if (c.kind === 'expression') {
      const e = c.path.node
      if (t.isFunction(e)) return t.objectProperty(t.identifier('children'), e)
      childValue(c.path, ctx) // fluxo → gancho da parte 2
      return propEntry('children', e)
    }
    return getter('children', c.path.node)
  }
  const items = children.map((c): t.Expression => {
    if (c.kind === 'text') return t.stringLiteral(c.value)
    if (c.kind === 'expression') {
      const e = c.path.node
      if (t.isFunction(e) || isLiteralValue(e)) return e
      return isDynamic(e) ? childValue(c.path, ctx) : e
    }
    return c.path.node
  })
  return getter('children', t.arrayExpression(items))
}

/**
 * `<Comp a="x" b={expr} key={k} {...sp}>filhos</Comp>` →
 * `keyed(() => k, () => component(Comp, mergeProps({ a: 'x', get b() { return expr } }, sp), dev))`.
 * JSX aninhado (filhos, props JSX) fica cru dentro dos getters e é compilado na próxima rodada.
 */
export function compileComponent(path: NodePath<t.JSXElement>, ctx: BodyContext): t.Expression {
  const mod = ctx.mod
  const sources: t.Expression[] = []
  let current: Array<t.ObjectProperty | t.ObjectMethod> | null = null
  let key: t.Expression | null = null
  const flush = () => {
    if (current) sources.push(t.objectExpression(current))
    current = null
  }
  for (const a of path.node.openingElement.attributes) {
    if (t.isJSXSpreadAttribute(a)) {
      flush()
      const e = a.argument
      // fonte reativa → função reavaliada a cada leitura (mergeProps)
      sources.push(t.isIdentifier(e) || !isDynamic(e) ? e : arrow(e))
      continue
    }
    const name = attrName(a)
    let value: t.Expression
    if (a.value == null) value = t.booleanLiteral(true)
    else if (t.isStringLiteral(a.value)) value = t.stringLiteral(a.value.value)
    else if (t.isJSXExpressionContainer(a.value)) {
      if (t.isJSXEmptyExpression(a.value.expression)) continue
      value = a.value.expression
    } else value = a.value // JSX como valor de atributo
    if (name === 'key') {
      key = value
      continue
    }
    if (name === 'ref') return mod.error(a, 'component-ref-unsupported', '`ref` em componente ainda não é suportado.')
    ;(current ??= []).push(propEntry(name, value))
  }
  const children = childrenEntry(path, ctx)
  if (children) (current ??= []).push(children)
  flush()
  const props =
    sources.length === 0
      ? t.objectExpression([])
      : sources.length === 1 && t.isObjectExpression(sources[0])
        ? sources[0]
        : mod.call('mergeProps', sources)
  const args: t.Expression[] = [calleeOf(path, ctx), props]
  const meta = mod.meta(jsxName(path.node.openingElement.name), path.node)
  if (meta) args.push(meta)
  const call = mod.call('component', args)
  if (key) return mod.call('keyed', [arrow(key), arrow(call)])
  return call
}
