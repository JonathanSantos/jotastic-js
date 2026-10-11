/**
 * Reescrita de leituras/escritas (18 §4), emissão das declarações classificadas (18 §3) e bindings de atributos de
 * elementos intrínsecos (18 §5.3–§5.6).
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { BindingInfo } from '@jotastic/analyzer'
import { attributeKind, eventName, isAssignable, normalizeAttribute } from '@jotastic/analyzer'
import { gid, isGenerated, type BodyContext, type Rule, type TwoWayKind } from '../context'
import { emitUseCall } from './use'
import { arrow, callMethod, importedName, isUseName, member, memberRoot } from './util'

// ─── Regras (18 §4) ──────────────────────────────────────────────────────────

/** Kinds cujas leituras viram `x.get()` (18 §4). `resource`/`list` são da parte 2. */
const GET_KINDS = new Set(['signal', 'state', 'memo', 'external'])
const SET_KINDS = new Set(['signal', 'state'])

function signalRule(name: string, writable: boolean): Rule {
  const rule: Rule = { read: () => callMethod(gid(name), 'get') }
  if (writable) rule.write = (v) => callMethod(gid(name), 'set', [v])
  return rule
}

/** Caminho de acesso a uma folha de um padrão de desestruturação. */
type Access = () => t.Expression

interface Leaf {
  id: t.Identifier
  access: Access
}

/**
 * Folhas de um padrão: `{ a, b: { c = 1 }, d: [e] }` → `a` ↦ `base.a`, `c` ↦ `base.b.c ?? 1`, `e` ↦ `base.d[0]`.
 * `rest` é tratado pelo chamador (só em props, 18 §4).
 */
function leaves(
  ctx: BodyContext,
  pattern: t.Node,
  access: Access,
  out: Leaf[],
  onRest?: (id: t.Identifier, keys: string[]) => void,
): void {
  if (t.isIdentifier(pattern)) {
    out.push({ id: pattern, access })
    return
  }
  if (t.isAssignmentPattern(pattern)) {
    const def = pattern.right
    leaves(ctx, pattern.left, () => t.logicalExpression('??', access(), t.cloneNode(def, true)), out, onRest)
    return
  }
  if (t.isObjectPattern(pattern)) {
    const keys: string[] = []
    for (const p of pattern.properties) {
      if (t.isRestElement(p)) {
        if (!onRest || !t.isIdentifier(p.argument)) return ctx.mod.notImplemented(p, 'rest aninhado em desestruturação')
        onRest(p.argument, keys)
        continue
      }
      let key: string
      if (!p.computed && t.isIdentifier(p.key)) key = p.key.name
      else if (t.isStringLiteral(p.key) || t.isNumericLiteral(p.key)) key = String(p.key.value)
      else return ctx.mod.notImplemented(p, 'chave computada em desestruturação reativa')
      keys.push(key)
      leaves(ctx, p.value, () => member(access(), key), out)
    }
    return
  }
  if (t.isArrayPattern(pattern)) {
    pattern.elements.forEach((e, i) => {
      if (!e) return
      if (t.isRestElement(e)) return ctx.mod.notImplemented(e, 'rest em desestruturação de array reativa')
      leaves(ctx, e, () => t.memberExpression(access(), t.numericLiteral(i), true), out)
    })
    return
  }
  ctx.mod.notImplemented(pattern, 'padrão de desestruturação')
}

/** Desestruturações de `const` derivado: declarator → temporária (`const _d = memo(() => init)`). */
const patternTemps = new WeakMap<t.Node, string>()

/** Props (componente): parâmetro único → `props`; desestruturadas viram `props.x [?? d]`, rest vira `rest(props, …)`. */
function setupParams(ctx: BodyContext): void {
  const fn = ctx.fn!
  const p0 = fn.node.params[0]
  if (!p0) return
  const pattern = t.isAssignmentPattern(p0) ? p0.left : p0
  if (t.isIdentifier(pattern)) {
    const b = fn.scope.getBinding(pattern.name)
    if (b) ctx.propBindings.add(b.identifier)
    return
  }
  if (!t.isObjectPattern(pattern)) return ctx.mod.notImplemented(p0, 'parâmetro de componente que não é objeto')
  const propsName = ctx.name('props')
  ctx.propsName = propsName
  const out: Leaf[] = []
  leaves(
    ctx,
    pattern,
    () => gid(propsName),
    out,
    (id, keys) => {
      const restName = ctx.name(`_${id.name}`)
      ctx.prelude.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            gid(restName),
            ctx.mod.call('rest', [gid(propsName), t.arrayExpression(keys.map((k) => t.stringLiteral(k)))]),
          ),
        ]),
      )
      const b = fn.scope.getBinding(id.name)
      if (b) {
        ctx.rules.set(b.identifier, { read: () => gid(restName) })
        ctx.propBindings.add(b.identifier)
      }
    },
  )
  for (const leaf of out) {
    const b = fn.scope.getBinding(leaf.id.name)
    if (!b) continue
    ctx.propBindings.add(b.identifier)
    // escrita em prop desestruturada: vira escrita no objeto (sem default)
    const target = (): t.Expression => {
      const e = leaf.access()
      return t.isLogicalExpression(e) ? e.left : e
    }
    ctx.rules.set(b.identifier, { read: leaf.access, target })
  }
}

/** Regras dos bindings do escopo raiz (18 §4). */
function setupBindings(ctx: BodyContext): void {
  const fn = ctx.fn!
  const done = new Set<t.Node>()
  for (const info of ctx.body!.bindings.values()) {
    if (info.flowIndex !== -1) continue // continuações: parte 2
    const d = info.declarator
    if (t.isIdentifier(d.id)) {
      if (!GET_KINDS.has(info.kind)) continue
      const b = fn.scope.getBinding(info.name)
      if (b) ctx.rules.set(b.identifier, signalRule(info.name, SET_KINDS.has(info.kind)))
      continue
    }
    if (done.has(d)) continue
    done.add(d)
    if (info.kind === 'memo') {
      // `const { a, b } = expr` derivado → `const _d = memo(() => expr)`; `a` → `_d.get().a`
      const tmp = ctx.name(`_${destructuredBase(d.id as t.LVal)}`)
      patternTemps.set(d, tmp)
      const out: Leaf[] = []
      leaves(ctx, d.id, () => callMethod(gid(tmp), 'get'), out)
      for (const leaf of out) {
        const b = fn.scope.getBinding(leaf.id.name)
        if (b) ctx.rules.set(b.identifier, { read: leaf.access })
      }
    } else {
      // `let { a, b } = expr`: cada folha reativa vira um signal próprio
      const out: Leaf[] = []
      leaves(ctx, d.id, () => t.identifier('_'), out)
      for (const leaf of out) {
        const li = ctx.body!.bindings.get(leaf.id.name)
        if (!li || !GET_KINDS.has(li.kind)) continue
        const b = fn.scope.getBinding(leaf.id.name)
        if (b) ctx.rules.set(b.identifier, signalRule(leaf.id.name, SET_KINDS.has(li.kind)))
      }
    }
  }
}

function destructuredBase(id: t.LVal): string {
  const names = Object.keys(t.getBindingIdentifiers(id))
  return names[0] ?? 'd'
}

export function setupRules(ctx: BodyContext): void {
  setupParams(ctx)
  setupBindings(ctx)
}

// ─── Two-way (18 §5.5): marcação antes da reescrita ─────────────────────────

function twoWayKind(tag: string, attr: string, type: string | null | undefined, multiple: boolean): TwoWayKind | null {
  if (tag === 'select') return attr === 'value' ? (multiple ? 'multiple' : 'select') : null
  if (tag === 'textarea') return attr === 'value' ? 'value' : null
  if (tag !== 'input') return null
  if (type === 'radio' || type === 'file') return null
  if (attr === 'checked') return type === 'checkbox' ? 'checked' : null
  if (attr !== 'value') return null
  if (type === 'checkbox') return null
  if (type === 'number' || type === 'range') return 'number'
  return 'value'
}

function findAttr(el: t.JSXOpeningElement, ...names: string[]): t.JSXAttribute | undefined {
  for (const a of el.attributes) {
    if (!t.isJSXAttribute(a)) continue
    const n = t.isJSXNamespacedName(a.name) ? `${a.name.namespace.name}:${a.name.name.name}` : a.name.name
    if (names.includes(n)) return a
  }
  return undefined
}

function isTrueAttr(a: t.JSXAttribute | undefined): boolean {
  if (!a) return false
  return (
    a.value == null || (t.isJSXExpressionContainer(a.value) && t.isBooleanLiteral(a.value.expression, { value: true }))
  )
}

/**
 * Troca `value={expr}` elegível a two-way por uma sentinela `_twoWay(expr, v => expr = v)`: a reescrita de §4 passa
 * pelos dois lados (`draft` → `draft.get()` / `draft.set(v)`) e a emissão do template lê a sentinela.
 */
export function markTwoWay(ctx: BodyContext): void {
  ctx.fn!.traverse({
    JSXOpeningElement(p) {
      const el = p.node
      if (!t.isJSXIdentifier(el.name)) return
      const tag = el.name.name
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return
      if (findAttr(el, 'onInput', 'onChange', 'on:input', 'on:change', 'readOnly', 'readonly')) return
      if (isTrueAttr(findAttr(el, 'disabled'))) return
      const typeAttr = findAttr(el, 'type')
      let type: string | null | undefined
      if (typeAttr) {
        const v = typeAttr.value
        if (t.isStringLiteral(v)) type = v.value
        else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) type = v.expression.value
        else type = null
      }
      const multiple = isTrueAttr(findAttr(el, 'multiple'))
      for (const name of ['value', 'checked']) {
        const attr = findAttr(el, name)
        if (!attr || !t.isJSXExpressionContainer(attr.value)) continue
        const expr = attr.value.expression
        if (t.isJSXEmptyExpression(expr)) continue
        const kind = twoWayKind(tag, name, type, multiple)
        if (!kind || !isAssignable(expr)) continue // não atribuível: dica `value-not-writable` do analyzer
        const root = memberRoot(expr)
        if (t.isIdentifier(root)) {
          if (ctx.isProp(p, root.name)) continue
          if (root === expr) {
            const b = p.scope.getBinding(root.name)
            if (b && (b.kind === 'const' || b.kind === 'module' || b.kind === 'param')) continue
          }
        }
        let used = false
        t.traverseFast(expr, (n) => {
          if (t.isIdentifier(n) && n.name === 'v') used = true
        })
        const v = t.identifier(used ? '_v' : 'v')
        const write = arrow(t.assignmentExpression('=', t.cloneNode(expr, true) as t.LVal, t.cloneNode(v)), [v])
        const sentinel = t.callExpression(gid('_twoWay'), [expr, write])
        ctx.mod.twoWay.set(sentinel, kind)
        attr.value.expression = sentinel
      }
    },
  })
}

// ─── Reescrita (18 §4) ───────────────────────────────────────────────────────

/** O valor da expressão é descartado (`x++` pode virar só `x.set(x.get() + 1)`). */
function valueUnused(p: NodePath): boolean {
  const parent = p.parentPath
  if (!parent) return true
  if (parent.isExpressionStatement()) return true
  if (parent.isArrowFunctionExpression() && p.key === 'body') return true
  if (parent.isForStatement() && p.key === 'update') return true
  if (parent.isSequenceExpression()) {
    const list = parent.node.expressions
    return list[list.length - 1] !== p.node || valueUnused(parent)
  }
  return false
}

const ASSIGN_LOGICAL: Record<string, '||' | '&&' | '??'> = { '||=': '||', '&&=': '&&', '??=': '??' }

function rewriteAssignment(p: NodePath<t.AssignmentExpression>, ctx: BodyContext): void {
  const { left, right, operator } = p.node
  if (t.isIdentifier(left)) {
    if (isGenerated(left)) return
    const rule = ctx.ruleFor(p, left.name)
    if (!rule) return
    if (!rule.write) {
      if (rule.target) p.get('left').replaceWith(rule.target())
      return
    }
    let value: t.Expression = right
    if (operator !== '=') {
      const logical = ASSIGN_LOGICAL[operator]
      value = logical
        ? t.logicalExpression(logical, rule.read(), right)
        : t.binaryExpression(operator.slice(0, -1) as t.BinaryExpression['operator'], rule.read(), right)
    }
    p.replaceWith(rule.write(value))
    return
  }
  if ((t.isArrayPattern(left) || t.isObjectPattern(left)) && operator === '=') {
    // `[a, b] = expr` com reativos → `const _t = expr; a.set(_t[0]); b.set(_t[1])`
    const ids = Object.keys(t.getBindingIdentifiers(left))
    if (!ids.some((n) => ctx.ruleFor(p, n)?.write)) return
    const stmt = p.parentPath
    if (!stmt.isExpressionStatement()) return ctx.mod.notImplemented(p.node, 'desestruturação reativa como expressão')
    const tmp = ctx.name('_t')
    const out: Leaf[] = []
    leaves(ctx, left, () => gid(tmp), out)
    const stmts: t.Statement[] = [t.variableDeclaration('const', [t.variableDeclarator(gid(tmp), right)])]
    for (const leaf of out) {
      const rule = ctx.ruleFor(p, leaf.id.name)
      stmts.push(
        t.expressionStatement(
          rule?.write ? rule.write(leaf.access()) : t.assignmentExpression('=', leaf.id, leaf.access()),
        ),
      )
    }
    stmt.replaceWithMultiple(stmts)
  }
}

function rewriteUpdate(p: NodePath<t.UpdateExpression>, ctx: BodyContext): void {
  const arg = p.node.argument
  if (!t.isIdentifier(arg) || isGenerated(arg)) return
  const rule = ctx.ruleFor(p, arg.name)
  if (!rule) return
  if (!rule.write) {
    if (rule.target) p.get('argument').replaceWith(rule.target())
    return
  }
  const op = p.node.operator === '++' ? '+' : '-'
  const set = rule.write(t.binaryExpression(op, rule.read(), t.numericLiteral(1)))
  if (valueUnused(p)) p.replaceWith(set)
  else if (p.node.prefix) p.replaceWith(t.sequenceExpression([set, rule.read()]))
  else
    p.replaceWith(
      t.sequenceExpression([set, t.binaryExpression(op === '+' ? '-' : '+', rule.read(), t.numericLiteral(1))]),
    )
}

/** Nome da variável declarada por `const x = external(…)` (para o `name` de dev). */
function declaredName(p: NodePath): string | undefined {
  const parent = p.parentPath
  return parent?.isVariableDeclarator() && t.isIdentifier(parent.node.id) ? parent.node.id.name : undefined
}

function argNames(args: t.Node[]): string {
  return args.map((a) => (t.isIdentifier(a) ? a.name : t.isMemberExpression(a) ? '…' : '…')).join(', ')
}

/** APIs de `jotastic` reescritas para o runtime (18 §4). */
function rewriteCall(p: NodePath<t.CallExpression>, ctx: BodyContext): void {
  const callee = p.node.callee
  if (!t.isIdentifier(callee) || isGenerated(callee)) return
  const api = importedName(p, callee.name)
  const mod = ctx.mod
  const args = p.node.arguments
  switch (api) {
    case 'watch': {
      // watch(fn) → effect(fn, dev)
      const meta = mod.meta('watch', p.node)
      p.node.callee = mod.helper('effect')
      if (meta) p.node.arguments = [...args, meta]
      return
    }
    case 'on': {
      // on(t, e, h) → on(() => t, e, h): alvo lazy
      p.node.callee = mod.helper('on')
      if (args[0] && !t.isSpreadElement(args[0]) && !t.isArgumentPlaceholder(args[0]))
        args[0] = arrow(args[0] as t.Expression)
      return
    }
    case 'external': {
      p.node.callee = mod.helper('external')
      const meta = mod.meta(declaredName(p), p.node)
      if (meta) {
        const padded = [...args]
        while (padded.length < 3) padded.push(t.identifier('undefined'))
        p.node.arguments = [...padded, meta]
      }
      return
    }
    case 'inspect': {
      if (!mod.opts.dev) {
        if (p.parentPath.isExpressionStatement()) p.parentPath.remove()
        else p.replaceWith(t.unaryExpression('void', t.numericLiteral(0)))
        return
      }
      const meta = mod.meta(argNames(args), p.node)!
      p.node.callee = mod.helper('inspect')
      p.node.arguments = [meta, ...args.map((a) => arrow(a as t.Expression))]
      return
    }
    case 'pending':
    case 'refresh':
      return mod.notImplemented(p.node, `\`${api}(…)\` (recursos de \`await\`)`)
    case 'useSlots':
      return mod.notImplemented(p.node, '`useSlots(children)` (slots)')
    case null:
      if (isUseName(callee.name)) emitUseCall(p, ctx)
      return
    default:
      return // useContext, onMount, onCleanup, untrack, tick, raw, mount…: inalterados (18 §4, §14)
  }
}

/** Aplica 18 §4 em todo o corpo (inclusive closures), respeitando sombreamento. */
export function rewriteBody(ctx: BodyContext): void {
  ctx.fn!.get('body').traverse({
    Identifier(p) {
      if (isGenerated(p.node) || !p.isReferencedIdentifier()) return
      const rule = ctx.ruleFor(p, p.node.name)
      if (!rule) return
      const parent = p.parentPath
      if (parent?.isObjectProperty() && parent.node.shorthand && p.key === 'value') parent.node.shorthand = false
      p.replaceWith(rule.read())
    },
    AssignmentExpression(p) {
      rewriteAssignment(p, ctx)
    },
    UpdateExpression(p) {
      rewriteUpdate(p, ctx)
    },
    CallExpression(p) {
      rewriteCall(p, ctx)
    },
  })
}

// ─── Declarações (18 §3 → runtime) ──────────────────────────────────────────

function constDecl(name: string, init: t.Expression): t.VariableDeclaration {
  return t.variableDeclaration('const', [t.variableDeclarator(gid(name), init)])
}

function withMeta(args: t.Expression[], meta: t.ObjectExpression | null): t.Expression[] {
  return meta ? [...args, meta] : args
}

/** `this` → `self` fora de funções não-arrow (corpo de getter de `memoLiteral`). */
function replaceThis(node: t.Node, self: string): void {
  const visit = (n: t.Node): void => {
    for (const key of t.VISITOR_KEYS[n.type] ?? []) {
      const child = (n as unknown as Record<string, unknown>)[key]
      const each = (c: unknown, set: (v: t.Node) => void) => {
        if (!c || typeof c !== 'object' || !('type' in c)) return
        const cn = c as t.Node
        if (t.isThisExpression(cn)) set(gid(self))
        else if (!(t.isFunction(cn) && !t.isArrowFunctionExpression(cn))) visit(cn)
      }
      if (Array.isArray(child)) child.forEach((c, i) => each(c, (v) => (child[i] = v)))
      else each(child, (v) => ((n as unknown as Record<string, unknown>)[key] = v))
    }
  }
  visit(node)
}

function emitDeclarator(ctx: BodyContext, d: t.VariableDeclarator, kind: 'let' | 'const'): t.Statement[] {
  const mod = ctx.mod
  const bindings = ctx.body!.bindings
  const keep = () => [t.variableDeclaration(kind, [d])]
  if (t.isIdentifier(d.id)) {
    const info: BindingInfo | undefined = bindings.get(d.id.name)
    if (!info || info.declarator !== d) return keep()
    const name = d.id.name
    const init = d.init ?? t.identifier('undefined')
    switch (info.kind) {
      case 'signal':
      case 'state':
        return [constDecl(name, mod.call(info.kind, withMeta([init], mod.meta(name, d.id))))]
      case 'memo':
        return [constDecl(name, mod.call('memo', withMeta([arrow(init)], mod.meta(name, d.id))))]
      case 'stateLiteral':
        return [constDecl(name, mod.call('reactive', [init]))]
      case 'memoLiteral': {
        // cada getter vira um memo; o objeto vira reativo (o getter devolve o memo)
        if (!t.isObjectExpression(init)) return keep()
        const memos: t.Statement[] = []
        for (const prop of init.properties) {
          if (!t.isObjectMethod(prop) || prop.kind !== 'get' || prop.computed || !t.isIdentifier(prop.key)) continue
          const memoName = ctx.name(`_${prop.key.name}`)
          const body = prop.body
          replaceThis(body, name)
          memos.push(
            constDecl(memoName, mod.call('memo', withMeta([arrow(body)], mod.meta(`${name}.${prop.key.name}`, prop)))),
          )
          prop.body = t.blockStatement([t.returnStatement(callMethod(gid(memoName), 'get'))])
        }
        return [constDecl(name, mod.call('reactive', [init])), ...memos]
      }
      case 'list':
        return mod.notImplemented(d, '`const` de lista (`const rows = items.map(i => <li/>)`)')
      case 'resource':
        return mod.notImplemented(d, '`await` no corpo do componente')
      default:
        return keep()
    }
  }
  // desestruturação
  const tmp = patternTemps.get(d)
  if (tmp) {
    const names = Object.keys(t.getBindingIdentifiers(d.id))
    const init = d.init ?? t.identifier('undefined')
    return [constDecl(tmp, mod.call('memo', withMeta([arrow(init)], mod.meta(names.join(', '), d.id))))]
  }
  const out: Leaf[] = []
  const tmpName = ctx.name('_d')
  leaves(ctx, d.id, () => gid(tmpName), out)
  if (!out.some((l) => SET_KINDS.has(bindings.get(l.id.name)?.kind ?? ''))) return keep()
  const stmts: t.Statement[] = [constDecl(tmpName, d.init ?? t.identifier('undefined'))]
  for (const leaf of out) {
    const k = bindings.get(leaf.id.name)?.kind ?? 'plain'
    if (SET_KINDS.has(k))
      stmts.push(constDecl(leaf.id.name, mod.call(k, withMeta([leaf.access()], mod.meta(leaf.id.name, leaf.id)))))
    else stmts.push(t.variableDeclaration(kind, [t.variableDeclarator(leaf.id, leaf.access())]))
  }
  return stmts
}

/** Emite as declarações do setup conforme a classificação (`let count = 0` → `const count = signal(0, dev)`). */
export function emitDeclarations(ctx: BodyContext): void {
  const body = ctx.fn!.get('body')
  if (!body.isBlockStatement()) return
  for (const stmt of body.get('body')) {
    if (!stmt.isVariableDeclaration() || stmt.node.kind === 'var') continue
    const kind = stmt.node.kind as 'let' | 'const'
    const out: t.Statement[] = []
    for (const d of stmt.node.declarations) out.push(...emitDeclarator(ctx, d, kind))
    // mantém declarações intactas quando nada mudou
    const unchanged =
      out.length === stmt.node.declarations.length &&
      out.every(
        (s, i) => t.isVariableDeclaration(s) && s.kind === kind && s.declarations[0] === stmt.node.declarations[i],
      )
    if (unchanged) continue
    stmt.replaceWithMultiple(out)
  }
}

/** Substitui os parâmetros desestruturados por `props` e insere o prelúdio (`const _rest = rest(props, …)`). */
export function finishParams(ctx: BodyContext): void {
  const fn = ctx.fn!
  if (ctx.propsName) fn.node.params = [gid(ctx.propsName)]
  if (!ctx.prelude.length) return
  const body = fn.get('body')
  if (body.isBlockStatement()) body.unshiftContainer('body', ctx.prelude)
  else body.replaceWith(t.blockStatement([...ctx.prelude, t.returnStatement(body.node as t.Expression)]))
}

// ─── Atributos de elementos intrínsecos (18 §5.3–§5.6) ──────────────────────

/** Resultado de um atributo: estático (vai para o HTML) ou binding (statements emitidos com a ref do elemento). */
export type AttrResult =
  | { kind: 'static'; html: string }
  | { kind: 'binding'; emit: (el: string) => t.Statement[]; deferred?: boolean }
  | { kind: 'skip' }

const STATIC_PROP_ATTR: Record<string, string> = {
  value: 'value',
  checked: 'checked',
  selected: 'selected',
  muted: 'muted',
  defaultValue: 'value',
  defaultChecked: 'checked',
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/** `class={{ a: true, b: false }}` / `class={['a', false && 'b']}` só com literais → `"a"`. */
function foldClass(e: t.Expression): string | null {
  if (t.isStringLiteral(e)) return e.value
  if (t.isTemplateLiteral(e) && e.expressions.length === 0) return e.quasis[0]?.value.cooked ?? ''
  if (t.isArrayExpression(e)) {
    const out: string[] = []
    for (const el of e.elements) {
      if (!el) continue
      if (t.isStringLiteral(el)) out.push(el.value)
      else if (
        t.isBooleanLiteral(el, { value: false }) ||
        t.isNullLiteral(el) ||
        t.isIdentifier(el, { name: 'undefined' })
      )
        continue
      else return null
    }
    return out.filter(Boolean).join(' ')
  }
  if (t.isObjectExpression(e)) {
    const out: string[] = []
    for (const p of e.properties) {
      if (!t.isObjectProperty(p) || p.computed) return null
      const key = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : null
      if (key == null) return null
      const v = p.value
      if (t.isBooleanLiteral(v)) {
        if (v.value) out.push(key)
      } else if (t.isNumericLiteral(v)) {
        if (v.value) out.push(key)
      } else if (t.isStringLiteral(v)) {
        if (v.value) out.push(key)
      } else if (t.isNullLiteral(v) || t.isIdentifier(v, { name: 'undefined' })) continue
      else return null
    }
    return out.join(' ')
  }
  return null
}

function staticValue(attr: t.JSXAttribute): { value: string | boolean | null } | null {
  const v = attr.value
  if (v == null) return { value: true }
  if (t.isStringLiteral(v)) return { value: v.value }
  if (!t.isJSXExpressionContainer(v)) return null
  const e = v.expression
  if (t.isStringLiteral(e)) return { value: e.value }
  if (t.isNumericLiteral(e)) return { value: String(e.value) }
  if (t.isTemplateLiteral(e) && e.expressions.length === 0) return { value: e.quasis[0]?.value.cooked ?? '' }
  if (t.isBooleanLiteral(e)) return { value: e.value }
  if (t.isNullLiteral(e) || t.isIdentifier(e, { name: 'undefined' })) return { value: null }
  return null
}

function stmt(e: t.Expression): t.ExpressionStatement {
  return t.expressionStatement(e)
}

/** `ref={x}` (18 §5.3). */
function emitRef(ctx: BodyContext, path: NodePath<t.JSXAttribute>, expr: t.Expression, el: string): t.Statement[] {
  const mod = ctx.mod
  if (t.isIdentifier(expr) && !isGenerated(expr)) {
    const b = path.scope.getBinding(expr.name)
    if (!b || b.kind === 'let' || b.kind === 'var') {
      const out: t.Statement[] = [stmt(t.assignmentExpression('=', t.identifier(expr.name), gid(el)))]
      if (ctx.inFlow)
        out.push(
          stmt(
            mod.call('onCleanup', [
              arrow(t.assignmentExpression('=', t.identifier(expr.name), t.identifier('undefined'))),
            ]),
          ),
        )
      return out
    }
    return [stmt(t.callExpression(expr, [gid(el)]))]
  }
  // `let` signal usado em ref (já reescrito para `x.get()`) → `x.set(el)`
  if (
    t.isCallExpression(expr) &&
    expr.arguments.length === 0 &&
    t.isMemberExpression(expr.callee) &&
    t.isIdentifier(expr.callee.object) &&
    isGenerated(expr.callee.object) &&
    t.isIdentifier(expr.callee.property, { name: 'get' })
  )
    return [stmt(callMethod(gid(expr.callee.object.name), 'set', [gid(el)]))]
  return [stmt(t.callExpression(expr, [gid(el)]))]
}

/**
 * Decide a emissão de um atributo de elemento intrínseco (tabela de 18 §5.3). `svg`: atributos SVG são sempre `attr`
 * e mantêm a caixa.
 */
export function elementAttribute(
  ctx: BodyContext,
  tag: string,
  svg: boolean,
  path: NodePath<t.JSXAttribute>,
): AttrResult {
  const mod = ctx.mod
  const raw = t.isJSXNamespacedName(path.node.name)
    ? `${path.node.name.namespace.name}:${path.node.name.name.name}`
    : path.node.name.name
  const name = normalizeAttribute(raw)
  const kind =
    svg && !eventName(name) && !['class', 'style', 'ref', 'key', 'children'].includes(name)
      ? 'attr'
      : attributeKind(tag, raw)
  const htmlName = svg ? name : name.toLowerCase()
  const st = staticValue(path.node)
  const container = path.node.value
  const expr =
    t.isJSXExpressionContainer(container) && !t.isJSXEmptyExpression(container.expression) ? container.expression : null

  const autofocusExtra = (): AttrResult | null =>
    ctx.inFlow && name.toLowerCase() === 'autofocus'
      ? { kind: 'binding', emit: (el) => [stmt(mod.call('autofocus', [gid(el)]))] }
      : null

  switch (kind) {
    case 'ignore':
      return { kind: 'skip' }
    case 'key':
      return mod.notImplemented(path.node, '`key` em elemento fora de lista')
    case 'children':
      return { kind: 'skip' } // tratado pelo chamador como conteúdo
    case 'ref':
      if (!expr) return { kind: 'skip' }
      return { kind: 'binding', emit: (el) => emitRef(ctx, path, expr, el) }
    case 'event': {
      const ev = eventName(name)!
      if (!expr) return { kind: 'skip' }
      return {
        kind: 'binding',
        emit: (el) => {
          const args: t.Expression[] = [gid(el), t.stringLiteral(ev[0]), expr]
          if (ev[1]) args.push(t.objectExpression([t.objectProperty(t.identifier('capture'), t.booleanLiteral(true))]))
          return [stmt(mod.call('listen', args))]
        },
      }
    }
    default:
      break
  }

  if (st) {
    if (st.value === null || st.value === false) return { kind: 'skip' }
    const staticAttr = (n: string): AttrResult =>
      st.value === true
        ? { kind: 'static', html: ` ${n}` }
        : { kind: 'static', html: ` ${n}="${escapeAttr(String(st.value))}"` }
    if (kind === 'prop' || kind === 'innerHTML') {
      const attrEq = kind === 'prop' ? STATIC_PROP_ATTR[name] : undefined
      if (attrEq && !svg) return staticAttr(attrEq)
      const lit = st.value === true ? t.booleanLiteral(true) : t.stringLiteral(String(st.value))
      return { kind: 'binding', emit: (el) => [stmt(mod.call('prop', [gid(el), t.stringLiteral(name), arrow(lit)]))] }
    }
    return staticAttr(htmlName)
  }
  if (!expr) return { kind: 'skip' }
  const read = () => arrow(expr)

  switch (kind) {
    case 'class': {
      const folded = foldClass(expr)
      if (folded != null) return folded ? { kind: 'static', html: ` class="${escapeAttr(folded)}"` } : { kind: 'skip' }
      return { kind: 'binding', emit: (el) => [stmt(mod.call('classList', [gid(el), read()]))] }
    }
    case 'style':
      return { kind: 'binding', emit: (el) => [stmt(mod.call('style', [gid(el), read()]))] }
    case 'prop':
    case 'innerHTML': {
      const twoWay = mod.twoWay.get(expr)
      const value = twoWay && t.isCallExpression(expr) ? (expr.arguments[0] as t.Expression) : expr
      const write = twoWay && t.isCallExpression(expr) ? (expr.arguments[1] as t.Expression) : null
      return {
        kind: 'binding',
        // M-1: `value` de <select> depois dos filhos (as <option> precisam existir)
        deferred: tag === 'select' && name === 'value',
        emit: (el) => {
          const out = [stmt(mod.call('prop', [gid(el), t.stringLiteral(name), arrow(value)]))]
          if (twoWay && write) out.push(stmt(mod.call('twoWay', [gid(el), t.stringLiteral(twoWay), write])))
          return out
        },
      }
    }
    case 'bool': {
      const extra = autofocusExtra()
      return {
        kind: 'binding',
        emit: (el) => [
          stmt(mod.call('bool', [gid(el), t.stringLiteral(name.toLowerCase()), read()])),
          ...(extra?.kind === 'binding' ? extra.emit(el) : []),
        ],
      }
    }
    default:
      return { kind: 'binding', emit: (el) => [stmt(mod.call('attr', [gid(el), t.stringLiteral(htmlName), read()]))] }
  }
}

/** `autofocus` estático dentro de branch/lista/continuação → `autofocus(el)` além do atributo (18 §5.6). */
export function autofocusBinding(ctx: BodyContext, path: NodePath<t.JSXAttribute>): AttrResult | null {
  const raw = t.isJSXNamespacedName(path.node.name) ? '' : path.node.name.name
  if (!ctx.inFlow || raw.toLowerCase() !== 'autofocus' || !staticValue(path.node)?.value) return null
  return { kind: 'binding', emit: (el) => [stmt(ctx.mod.call('autofocus', [gid(el)]))] }
}

/** `{...obj}` em elemento → `spread(el, () => obj)`. */
export function elementSpread(ctx: BodyContext, expr: t.Expression): AttrResult {
  return { kind: 'binding', emit: (el) => [stmt(ctx.mod.call('spread', [gid(el), arrow(expr)]))] }
}
