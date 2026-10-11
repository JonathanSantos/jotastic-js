/**
 * Componentes no JSX (18 §6): `component(Comp, props, dev)`, props estáticas como valores e dinâmicas como getters,
 * `mergeProps` para spread, `keyed` para `key`, `children` e slots (§12: `<Slot name>` → objeto de slots).
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { BodyContext } from '../context'
import { childrenOf, type Child } from './template'
import { childValue } from './flow'
import { arrow, attrName, getter, importedName, isDynamic, isJSX, isLiteralValue, jsxName, propKey } from './util'

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

// ─── Slots (18 §12) ──────────────────────────────────────────────────────────

/** `<Slot>` de `jotastic` (ou global, como no analyzer). */
function isSlotElement(path: NodePath<t.JSXElement>): boolean {
  const name = path.node.openingElement.name
  if (!t.isJSXIdentifier(name) || name.name !== 'Slot') return false
  return !path.scope.getBinding('Slot') || importedName(path, 'Slot') === 'Slot'
}

function isSlot(c: Child): c is Extract<Child, { kind: 'component' }> {
  return c.kind === 'component' && isSlotElement(c.path)
}

/** `{a && <Slot/>}`, `{a ? <Slot/> : …}`, `{<><Slot/></>}`: expressão de filho que esconde um `<Slot>`. */
function hidesSlot(path: NodePath): boolean {
  if (path.isJSXElement()) return isSlotElement(path)
  if (path.isJSXFragment())
    return path
      .get('children')
      .some((c) => (c.isJSXExpressionContainer() ? hidesSlot(c.get('expression')) : hidesSlot(c)))
  if (path.isLogicalExpression({ operator: '&&' })) return hidesSlot(path.get('right'))
  if (path.isConditionalExpression()) return hidesSlot(path.get('consequent')) || hidesSlot(path.get('alternate'))
  return false
}

/** Valor "vazio" num lado de condicional com slot (`cond ? <Slot/> : null`). */
function isEmptyValue(n: t.Node): boolean {
  return (
    t.isNullLiteral(n) ||
    t.isBooleanLiteral(n, { value: false }) ||
    t.isIdentifier(n, { name: 'undefined' }) ||
    (t.isStringLiteral(n) && n.value === '')
  )
}

interface SlotEntry {
  name: string
  /** Condições acumuladas (`a && <Slot/>`, ternários); vazio = incondicional. */
  conds: t.Expression[]
  /** Função do slot: `() => <conteúdo>` ou o render prop como está. */
  fn: t.Expression
}

/** `() => conteúdo` a partir de uma lista de filhos (texto, elementos/componentes crus, `{…}` como accessor). */
function renderFn(children: Child[], ctx: BodyContext): t.Expression {
  if (children.length === 0) return arrow(t.nullLiteral())
  const value = (c: Child): t.Expression => {
    if (c.kind === 'text') return t.stringLiteral(c.value)
    if (c.kind === 'expression') {
      const e = c.path.node
      if (t.isFunction(e) || isLiteralValue(e)) return e
      return isDynamic(e) ? childValue(c.path, ctx) : e
    }
    return c.path.node
  }
  if (children.length === 1) {
    const c = children[0]!
    if (c.kind === 'expression' && !t.isFunction(c.path.node)) {
      const v = value(c)
      // accessor `() => expr` já é a função do slot
      return t.isArrowFunctionExpression(v) && v.params.length === 0 ? v : arrow(v)
    }
    return arrow(value(c))
  }
  return arrow(t.arrayExpression(children.map(value)))
}

function slotName(path: NodePath<t.JSXElement>, ctx: BodyContext): string {
  for (const a of path.node.openingElement.attributes) {
    if (!t.isJSXAttribute(a) || attrName(a) !== 'name') continue
    if (t.isStringLiteral(a.value)) return a.value.value
    if (t.isJSXExpressionContainer(a.value) && t.isStringLiteral(a.value.expression)) return a.value.expression.value
  }
  // o analyzer já acusa `slot-name-not-literal`; defesa para o plugin Babel sem análise completa
  return ctx.mod.error(
    path.node,
    'slot-name-not-literal',
    '`<Slot name>` precisa de uma string literal: os slots são separados em tempo de build.',
  )
}

function slotEntry(path: NodePath<t.JSXElement>, conds: t.Expression[], ctx: BodyContext): SlotEntry {
  const name = slotName(path, ctx)
  const children = childrenOf(path, ctx)
  const only = children.length === 1 ? children[0]! : null
  // um único filho função → render prop `(…args) => …` como está
  const fn = only?.kind === 'expression' && t.isFunction(only.path.node) ? only.path.node : renderFn(children, ctx)
  return { name, conds, fn }
}

/**
 * Children de componente com `<Slot>` (18 §12) → `{ [SLOTS]: true, default, n1, get n2() { … } }`. Os filhos que
 * não estão em `<Slot>` formam `default`.
 */
function slotsEntry(children: Child[], ctx: BodyContext): t.ObjectProperty {
  const mod = ctx.mod
  const entries: SlotEntry[] = []
  const rest: Child[] = []
  const scan = (path: NodePath, conds: t.Expression[]): void => {
    if (path.isJSXElement() && isSlotElement(path)) {
      entries.push(slotEntry(path, conds, ctx))
      return
    }
    if (path.isJSXFragment()) {
      for (const c of path.get('children')) {
        if (c.isJSXText()) {
          if (c.node.value.trim()) mod.notImplemented(c.node, 'texto ao lado de `<Slot>` condicional')
        } else if (c.isJSXExpressionContainer()) {
          const e = c.get('expression')
          if (!e.isJSXEmptyExpression()) scan(e, conds)
        } else scan(c, conds)
      }
      return
    }
    if (path.isLogicalExpression({ operator: '&&' })) {
      scan(path.get('right'), [...conds, path.node.left])
      return
    }
    if (path.isConditionalExpression()) {
      const test = path.node.test
      scan(path.get('consequent'), [...conds, test])
      scan(path.get('alternate'), [...conds, t.unaryExpression('!', t.cloneNode(test, true))])
      return
    }
    if (isEmptyValue(path.node)) return
    // `a ? <Slot name="x"/> : <p/>`: o lado sem slot precisaria ir para `default` sob a condição inversa
    mod.notImplemented(path.node, 'filho comum dentro de condicional com `<Slot>`')
  }
  for (const c of children) {
    if (isSlot(c)) entries.push(slotEntry(c.path, [], ctx))
    else if (c.kind === 'expression' && hidesSlot(c.path)) scan(c.path, [])
    else rest.push(c)
  }

  const props: Array<t.ObjectProperty | t.ObjectMethod> = [
    t.objectProperty(mod.helper('SLOTS'), t.booleanLiteral(true), true),
    t.objectProperty(t.identifier('default'), renderFn(rest, ctx)),
  ]
  // mesmo nome em mais de um `<Slot>` (ex.: ternário): o primeiro cuja condição vale
  const byName = new Map<string, SlotEntry[]>()
  for (const e of entries) {
    const list = byName.get(e.name) ?? []
    list.push(e)
    byName.set(e.name, list)
  }
  for (const [name, list] of byName) {
    let value: t.Expression = t.identifier('undefined')
    let conditional = true
    for (const e of [...list].reverse()) {
      if (!e.conds.length) {
        value = e.fn
        conditional = false
        continue
      }
      const cond = e.conds.reduce((a, b) => t.logicalExpression('&&', a, b))
      value = t.conditionalExpression(cond, e.fn, value)
      conditional = true
    }
    props.push(conditional ? getter(name, value) : t.objectProperty(propKey(name), value))
  }
  return t.objectProperty(t.identifier('children'), t.objectExpression(props))
}

/** `children` do componente (18 §6): um filho → getter/valor; vários → getter com array. */
function childrenEntry(path: NodePath<t.JSXElement>, ctx: BodyContext): t.ObjectProperty | t.ObjectMethod | null {
  const children = childrenOf(path, ctx)
  if (children.length === 0) return null
  // slots (18 §12): `{ [SLOTS]: true, default, … }`
  if (children.some((c) => isSlot(c) || (c.kind === 'expression' && hidesSlot(c.path))))
    return slotsEntry(children, ctx)
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
