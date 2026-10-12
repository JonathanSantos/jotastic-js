/**
 * Funções `use*` (18 §11, 03 §Funções `use*`, 17 §Convenções de emissão).
 *
 * - `compileUseBody(ctx)`: parâmetros posicionais lazy (`p` → `p()`; defaults em thunk no callee, D59: `p = _void`,
 *   `p = () => d`; desestruturado `_arg0().a`; rest `args.map((_g) => _g())`), corpo com as regras do componente (§3/§4) e objeto de retorno por propriedade:
 *   `let` → getter + setter; `const` memo/externo (ou parâmetro) → getter; expressão com leituras reativas → memo
 *   hoisted + getter; função/literal sem leituras → como está.
 * - `emitUseCall(path, ctx)`: `useX(a, b)` → `useX(() => a', () => b')`; só os argumentos escritos (o callee cobre os
 *   ausentes com `_void`, D59; `undefined` literal vai cru para o default do callee valer). Spread (`useX(...xs)`) é erro do analyzer (`use-spread-args-unsupported`).
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import { gid, type BodyContext } from '../context'
import { emitDeclarations, rewriteBody, setupBindings } from './bindings'
import { arrow, callMethod, getter, isLiteralValue, walk } from './util'

// ─── Parâmetros ──────────────────────────────────────────────────────────────

/** Folhas de um padrão de desestruturação de parâmetro: `{ a, b: [c] }` → `a` ↦ `base.a`, `c` ↦ `base.b[0]`. */
function paramLeaves(
  ctx: BodyContext,
  pattern: t.Node,
  access: () => t.Expression,
  out: Array<{ id: t.Identifier; access: () => t.Expression }>,
): void {
  if (t.isIdentifier(pattern)) out.push({ id: pattern, access })
  else if (t.isAssignmentPattern(pattern)) {
    const def = pattern.right
    paramLeaves(ctx, pattern.left, () => t.logicalExpression('??', access(), t.cloneNode(def, true)), out)
  } else if (t.isObjectPattern(pattern)) {
    for (const p of pattern.properties) {
      if (t.isRestElement(p)) return ctx.mod.notImplemented(p, 'rest em desestruturação de parâmetro de `use*`')
      let key: string
      if (!p.computed && t.isIdentifier(p.key)) key = p.key.name
      else if (t.isStringLiteral(p.key) || t.isNumericLiteral(p.key)) key = String(p.key.value)
      else return ctx.mod.notImplemented(p, 'chave computada em parâmetro de `use*`')
      paramLeaves(
        ctx,
        p.value,
        () =>
          t.isValidIdentifier(key)
            ? t.memberExpression(access(), t.identifier(key))
            : t.memberExpression(access(), t.stringLiteral(key), true),
        out,
      )
    }
  } else if (t.isArrayPattern(pattern)) {
    pattern.elements.forEach((e, i) => {
      if (!e) return
      if (t.isRestElement(e)) return ctx.mod.notImplemented(e, 'rest em desestruturação de parâmetro de `use*`')
      paramLeaves(ctx, e, () => t.memberExpression(access(), t.numericLiteral(i), true), out)
    })
  } else ctx.mod.notImplemented(pattern, 'padrão de parâmetro de `use*`')
}

/**
 * Regras dos parâmetros posicionais (18 §11, D59): todo parâmetro é getter e o callee se protege com defaults em
 * thunk: sem default → `p = _void`; com default → `p = () => d`. Padrões viram um identificador simples (`_arg0`).
 */
function setupUseParams(ctx: BodyContext): void {
  const fn = ctx.fn!
  const scope = fn.scope
  const thunkDefault = (id: t.Identifier, def: t.Expression | null): t.AssignmentPattern =>
    t.assignmentPattern(id, def ? arrow(def) : ctx.mod.helper('_void'))
  fn.node.params = fn.node.params.map((param) => {
    if (t.isRestElement(param)) {
      // `...args` → array de getters; leitura de `args` devolve os valores atuais
      if (!t.isIdentifier(param.argument)) return ctx.mod.notImplemented(param, 'rest desestruturado em `use*`')
      const name = param.argument.name
      const b = scope.getBinding(name)
      const g = ctx.name('_g')
      if (b)
        ctx.rules.set(b.identifier, {
          read: () => callMethod(gid(name), 'map', [arrow(t.callExpression(gid(g), []), [gid(g)])]),
        })
      return param
    }
    const pattern = t.isAssignmentPattern(param) ? param.left : param
    const def = t.isAssignmentPattern(param) ? param.right : null
    if (t.isIdentifier(pattern)) {
      const name = pattern.name
      const b = scope.getBinding(name)
      if (b) ctx.rules.set(b.identifier, { read: () => t.callExpression(gid(name), []) })
      return thunkDefault(pattern, def)
    }
    if (!t.isObjectPattern(pattern) && !t.isArrayPattern(pattern))
      return ctx.mod.notImplemented(param, 'parâmetro de `use*`')
    // `({ a, b } = d)` → `_arg0 = () => d`; `a` → `_arg0().a`
    const name = ctx.name('_arg', true)
    const out: Array<{ id: t.Identifier; access: () => t.Expression }> = []
    paramLeaves(ctx, pattern, () => t.callExpression(gid(name), []), out)
    for (const leaf of out) {
      const b = scope.getBinding(leaf.id.name)
      if (b) ctx.rules.set(b.identifier, { read: leaf.access })
    }
    return thunkDefault(gid(name), def)
  })
}

// ─── Retorno (17 §Convenções de emissão) ────────────────────────────────────

type ReturnPlan =
  | { kind: 'getset'; key: string; read: () => t.Expression; write: (v: t.Expression) => t.Expression }
  | { kind: 'get'; key: string; read: () => t.Expression }
  | { kind: 'memo'; key: string; value: t.Expression }

/** `return` do corpo (fora de funções aninhadas). Arrow de expressão vira bloco antes. */
function returnStatements(ctx: BodyContext): t.ReturnStatement[] {
  const fn = ctx.fn!.node
  if (!t.isBlockStatement(fn.body)) fn.body = t.blockStatement([t.returnStatement(fn.body)])
  const out: t.ReturnStatement[] = []
  walk(fn.body, (n) => {
    if (t.isReturnStatement(n)) out.push(n)
  })
  return out
}

function keyName(p: t.ObjectProperty): string | null {
  if (p.computed) return null
  if (t.isIdentifier(p.key)) return p.key.name
  if (t.isStringLiteral(p.key) || t.isNumericLiteral(p.key)) return String(p.key.value)
  return null
}

/** Bindings que são objetos reativos (proxy ou getters): `x.y` é leitura reativa. */
const REACTIVE_OBJECTS = new Set(['useResult', 'stateLiteral', 'memoLiteral', 'resource'])

/** O valor lê algum binding reativo (fora de funções aninhadas)? Avaliado antes da reescrita. */
function hasReactiveRead(ctx: BodyContext, value: t.Node, scopePath: NodePath): boolean {
  const visit = (n: t.Node, root: boolean): boolean => {
    if (!root && t.isFunction(n)) return false
    if (t.isIdentifier(n)) {
      if (ctx.ruleFor(scopePath, n.name)) return true
      // objetos reativos lidos por membro (`inner.n`, `pos.x`): leitura reativa sem regra de reescrita
      const info = ctx.body!.bindings.get(n.name)
      const b = scopePath.scope.getBinding(n.name)
      return (
        !!info &&
        !!b &&
        REACTIVE_OBJECTS.has(info.kind) &&
        Object.values(t.getBindingIdentifiers(info.declarator.id)).includes(b.identifier)
      )
    }
    for (const key of t.VISITOR_KEYS[n.type] ?? []) {
      // chaves de objeto e propriedades de membro não são leituras
      if (key === 'key' && t.isObjectProperty(n) && !n.computed) continue
      if (key === 'property' && (t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) && !n.computed) continue
      const child = (n as unknown as Record<string, unknown>)[key]
      const list = Array.isArray(child) ? child : [child]
      for (const c of list) if (c && typeof c === 'object' && 'type' in c && visit(c as t.Node, false)) return true
    }
    return false
  }
  return visit(value, true)
}

/**
 * Planeja cada propriedade dos objetos literais retornados, ANTES da reescrita de §4 (precisa ver os identificadores
 * originais). Devolve as ações a aplicar depois da reescrita.
 */
function planReturns(ctx: BodyContext): Array<() => void> {
  const fn = ctx.fn!
  const actions: Array<() => void> = []
  for (const ret of returnStatements(ctx)) {
    const obj = ret.argument
    if (!obj || !t.isObjectExpression(obj)) continue // função, `undefined`, proxy (`return pos`): como está
    const plans = new Map<t.ObjectProperty, ReturnPlan>()
    for (const prop of obj.properties) {
      if (!t.isObjectProperty(prop)) continue // getters/métodos/spread: como estão
      const key = keyName(prop)
      if (key == null) continue
      const value = prop.value as t.Expression
      if (t.isFunction(value) || isLiteralValue(value)) continue
      if (t.isIdentifier(value)) {
        const rule = ctx.ruleFor(fn, value.name)
        // stateLiteral (proxy), useResult (getters), função, plain: como está
        if (!rule) continue
        // `let` (signal/state) → getter + setter; memo/external/parâmetro → getter que relê
        plans.set(
          prop,
          rule.write
            ? { kind: 'getset', key, read: rule.read, write: rule.write }
            : { kind: 'get', key, read: rule.read },
        )
        continue
      }
      if (!hasReactiveRead(ctx, value, fn)) continue
      plans.set(prop, { kind: 'memo', key, value })
    }
    if (!plans.size) continue
    actions.push(() => applyReturn(ctx, ret, obj, plans))
  }
  return actions
}

/** Troca as propriedades planejadas por getters/setters e insere os memos antes do `return`. */
function applyReturn(
  ctx: BodyContext,
  ret: t.ReturnStatement,
  obj: t.ObjectExpression,
  plans: Map<t.ObjectProperty, ReturnPlan>,
): void {
  const mod = ctx.mod
  const memos: t.Statement[] = []
  const props: t.ObjectExpression['properties'] = []
  for (const prop of obj.properties) {
    const plan = t.isObjectProperty(prop) ? plans.get(prop) : undefined
    if (!plan) {
      props.push(prop)
      continue
    }
    if (plan.kind === 'get') props.push(getter(plan.key, plan.read()))
    else if (plan.kind === 'getset') {
      const v = gid('v')
      props.push(getter(plan.key, plan.read()))
      props.push(
        t.objectMethod(
          'set',
          t.isValidIdentifier(plan.key) ? t.identifier(plan.key) : t.stringLiteral(plan.key),
          [v],
          t.blockStatement([t.expressionStatement(plan.write(gid('v')))]),
        ),
      )
    } else {
      const name = ctx.name(`_${t.isValidIdentifier(plan.key) ? plan.key : 'value'}`)
      // o valor (já reescrito) é o nó que ficou na propriedade
      const value = (prop as t.ObjectProperty).value as t.Expression
      const args: t.Expression[] = [arrow(value)]
      const meta = mod.meta(plan.key, plan.value)
      if (meta) args.push(meta)
      memos.push(t.variableDeclaration('const', [t.variableDeclarator(gid(name), mod.call('memo', args))]))
      props.push(getter(plan.key, callMethod(gid(name), 'get')))
    }
  }
  obj.properties = props
  if (!memos.length) return
  // memo hoisted: imediatamente antes do `return` (no mesmo bloco)
  const fn = ctx.fn!
  let done = false
  fn.traverse({
    ReturnStatement(p) {
      if (done || p.node !== ret) return
      done = true
      if (p.parentPath.isBlockStatement()) p.insertBefore(memos)
      else p.replaceWith(t.blockStatement([...memos, ret]))
      p.stop()
    },
  })
}

/** Corpo `use*` (18 §11): parâmetros lazy, §3/§4 completos, retorno por propriedade. */
export function compileUseBody(ctx: BodyContext): void {
  setupUseParams(ctx)
  setupBindings(ctx)
  const finish = planReturns(ctx)
  rewriteBody(ctx)
  emitDeclarations(ctx)
  for (const f of finish) f()
}

// ─── Chamadas ────────────────────────────────────────────────────────────────

/** `useX(a, b)` → `useX(() => a, () => b)`: as reescritas de §4 entram nos thunks na continuação da travessia. */
export function emitUseCall(path: NodePath<t.CallExpression>, ctx: BodyContext): void {
  const args = path.node.arguments
  if (args.some((a) => t.isSpreadElement(a) || t.isArgumentPlaceholder(a))) {
    return ctx.mod.notImplemented(path.node, 'spread em argumentos de chamada a `use*`')
  }
  // `undefined` literal vai cru: o default do callee (`p = _void` / `p = () => d`) se aplica, como em JS
  const isUndefined = (a: t.Expression) =>
    (t.isIdentifier(a, { name: 'undefined' }) && !path.scope.getBinding('undefined')) ||
    (t.isUnaryExpression(a, { operator: 'void' }) && t.isNumericLiteral(a.argument))
  path.node.arguments = (args as t.Expression[]).map((a) => (isUndefined(a) ? t.identifier('undefined') : arrow(a)))
}
