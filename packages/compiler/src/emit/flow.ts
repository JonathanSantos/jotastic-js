/**
 * Controle de fluxo (18 §7–§10): condicionais, listas, early return e `await`.
 *
 * Fases (chamadas por `module.ts`, na ordem):
 * 1. `checkBodyFlow(ctx)` — antes de qualquer reescrita: valida, guarda os pontos de decisão do escopo raiz (§9) e os
 *    `await` (§10: `x` → `_rN.value.get()`), registra as regras do fluxo (índice de lista → `i()`, `const` de lista →
 *    `_rows`, mini-corpo do item) e os `data-jo` dos casos.
 * 2. `emitBodyFlow(ctx)` — depois de `rewriteBody`/`emitDeclarations`: emite os signals/memos do mini-corpo dos itens
 *    e reestrutura o escopo raiz em `return branches([...], () => { continuação })` e
 *    `const _rN = resource(() => expr); return continuation(_rN, () => { continuação })`; remove o `async`.
 * 3. Durante as rodadas de JSX (`template.ts`): `childValue` devolve `branches(...)` para condicionais em posição de
 *    filho e `listStatement` emite `list(parent, marker, …)` para listas em filho de elemento.
 *
 * Funções de render de casos, itens e continuações ficam em `flowFns`: o JSX dentro delas compila com
 * `ctx.inFlow = true` (`onCleanup` do `ref`, `autofocus(el)`; 18 §5.3, §5.6).
 *
 * Um `await` no escopo raiz é mais um ponto de decisão de `sequence` (setup → `resource`, resto → `continuation`);
 * a ordem do código é respeitada (§10.9): `if` depois de `await` fica dentro da continuação dele, e vice-versa.
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import { isProbablyPrimitive } from '@jotastic/analyzer'
import { gid, isGenerated, type BodyContext, type Rule } from '../context'
import { leaves, type Leaf } from './bindings'
import { arrow, attrName, callMethod, isDynamic, isIntrinsic, isJSX, isLiteralValue, member, some } from './util'

// ─── Detecção ────────────────────────────────────────────────────────────────

/** Contém JSX fora de funções aninhadas? */
function hasJSX(n: t.Node): boolean {
  return some(n, isJSX)
}

/** `SRC(.filter|…)*.map(fn)` com JSX no retorno de `fn` (18 §8). */
export function isListExpression(n: t.Node): n is t.CallExpression | t.OptionalCallExpression {
  if (!t.isCallExpression(n) && !t.isOptionalCallExpression(n)) return false
  const callee = n.callee
  if (!(t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) || callee.computed) return false
  if (!t.isIdentifier(callee.property, { name: 'map' })) return false
  const cb = n.arguments[0]
  if (!cb || !t.isFunction(cb)) return false
  return t.isBlockStatement(cb.body)
    ? some(cb.body, (x) => t.isReturnStatement(x) && !!x.argument && hasJSX(x.argument))
    : hasJSX(cb.body)
}

/** Objeto literal de JSX indexado: `{{ a: <A/>, b: <B/> }[s]}` (18 §7). */
function isIndexedObject(n: t.Node): n is t.MemberExpression & { object: t.ObjectExpression } {
  return t.isMemberExpression(n) && n.computed && t.isObjectExpression(n.object) && hasJSX(n.object)
}

/** Condicional em posição de filho que vira `branches` (18 §7; K-4: só quando há JSX). */
function isConditionalChild(expr: t.Node): boolean {
  if (t.isConditionalExpression(expr)) return hasJSX(expr.consequent) || hasJSX(expr.alternate)
  if (t.isLogicalExpression(expr)) return hasJSX(expr.right)
  return isIndexedObject(expr)
}

/** Expressão de filho que é condicional/lista/objeto de JSX indexado (18 §7, §8). */
export function isFlowChild(expr: t.Node): boolean {
  return isConditionalChild(expr) || isListExpression(expr)
}

// ─── Estado por corpo ────────────────────────────────────────────────────────

/** Funções de render de casos, itens de lista e continuações (o JSX dentro delas está "em fluxo"). */
const flowFns = new WeakSet<t.Node>()

interface FlowState {
  /** Statements do escopo raiz que são pontos de decisão (§9). */
  decisions: Set<t.Node>
  /** Callbacks de lista (`.map(cb)` em filho de elemento ou `const` de lista). */
  listCallbacks: Set<t.Function>
  /** Declarações do mini-corpo dos itens → kind (`signal`/`state`/`memo`). */
  itemDecls: Map<t.VariableDeclarator, 'signal' | 'state' | 'memo'>
  /** `const rows = xs.map(…)` → nome da função gerada (`_rows`). */
  listConsts: Map<t.VariableDeclarator, string>
  /** Nomes gerados de `const` de lista (o `{_rows}` no JSX vira `_rows(parent, marker)`). */
  listConstNames: Set<string>
  /** Statements do escopo raiz com `await` (§10) → recurso. */
  awaits: Map<t.Node, AwaitPoint>
}

interface AwaitPoint {
  /** Nome do recurso (`_r0`). */
  name: string
  node: t.AwaitExpression
  /** Declarador (`const x = await …`); ausente em `await expr` solto. */
  declarator: t.VariableDeclarator | null
}

const states = new WeakMap<BodyContext, FlowState>()

function stateOf(ctx: BodyContext): FlowState {
  let s = states.get(ctx)
  if (!s) {
    s = {
      decisions: new Set(),
      listCallbacks: new Set(),
      itemDecls: new Map(),
      listConsts: new Map(),
      listConstNames: new Set(),
      awaits: new Map(),
    }
    states.set(ctx, s)
  }
  return s
}

/** Callees `i` gerados pela regra do índice (`i` → `i()`); a função de `key` recebe o número e os desfaz. */
const indexCallees = new WeakSet<t.Node>()

/** O JSX em `path` está dentro de uma função de render de fluxo (antes de chegar ao corpo reativo)? */
export function isInFlow(path: NodePath, ctx: BodyContext): boolean {
  const stop = ctx.fn?.node
  for (let p: NodePath | null = path.parentPath; p && p.node !== stop; p = p.parentPath) {
    if (flowFns.has(p.node)) return true
  }
  return false
}

// ─── Fase 1: antes da reescrita ──────────────────────────────────────────────

/** `return` direto do statement (ele mesmo, ou filho direto do bloco) e o que vem antes dele (como o analyzer). */
function directReturn(stmt: t.Statement): { ret: t.ReturnStatement; prelude: t.Statement[] } | null {
  if (t.isReturnStatement(stmt)) return { ret: stmt, prelude: [] }
  if (t.isBlockStatement(stmt)) {
    const i = stmt.body.findIndex((s) => t.isReturnStatement(s))
    if (i >= 0) return { ret: stmt.body[i] as t.ReturnStatement, prelude: stmt.body.slice(0, i) }
  }
  return null
}

function caseReturn(c: t.SwitchCase): { ret: t.ReturnStatement; prelude: t.Statement[] } | null {
  const body = c.consequent.length === 1 && t.isBlockStatement(c.consequent[0]) ? c.consequent[0].body : c.consequent
  const i = body.findIndex((s) => t.isReturnStatement(s))
  return i >= 0 ? { ret: body[i] as t.ReturnStatement, prelude: body.slice(0, i) } : null
}

/** Statement do escopo raiz que contém `node`. */
function rootStatementOf(ctx: BodyContext, node: t.Node): t.Statement | null {
  const body = ctx.fn!.node.body
  if (!t.isBlockStatement(body)) return null
  for (const s of body.body) if (some(s, (n) => n === node)) return s
  return null
}

/** O `{expr}` é filho direto de um elemento intrínseco? (posição onde `list(parent, marker, …)` é possível) */
function isElementChild(p: NodePath): boolean {
  const container = p.parentPath
  if (!container?.isJSXExpressionContainer() || container.listKey !== 'children') return false
  const parent = container.parentPath
  return !!parent?.isJSXElement() && isIntrinsic(parent.node.openingElement.name)
}

/** Leitura em contexto vivo do item: dentro de `{…}`/atributo do JSX, sem função entre ela e o callback. */
function isLiveInItem(ref: NodePath, cb: t.Function): boolean {
  let inJSX = false
  for (let p: NodePath | null = ref.parentPath; p && p.node !== cb; p = p.parentPath) {
    if (p.isFunction()) return false
    if (p.isJSXExpressionContainer() || p.isJSXSpreadAttribute()) inJSX = true
  }
  return inJSX
}

function assignmentIsPrimitive(v: NodePath): boolean {
  if (v.isUpdateExpression()) return true
  if (v.isAssignmentExpression()) {
    const op = v.node.operator
    return op === '=' || op === '||=' || op === '&&=' || op === '??=' ? isProbablyPrimitive(v.node.right) : true
  }
  return false
}

/** `const` do item que é derivado: chamada, membro ou leitura de binding com regra (18 §3, versão do item). */
function isDerivedInit(init: t.Expression, scope: NodePath['scope'], ctx: BodyContext): boolean {
  if (t.isFunction(init) || isJSX(init) || isListExpression(init)) return false
  return some(init, (n) => {
    if (t.isCallExpression(n) || t.isOptionalCallExpression(n) || t.isNewExpression(n)) return true
    if (t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) return true
    if (t.isIdentifier(n)) {
      const b = scope.getBinding(n.name)
      return !!b && (ctx.rules.has(b.identifier) || ctx.propBindings.has(b.identifier))
    }
    return false
  })
}

function signalRule(name: string, writable: boolean): Rule {
  const rule: Rule = { read: () => callMethod(gid(name), 'get') }
  if (writable) rule.write = (v) => callMethod(gid(name), 'set', [v])
  return rule
}

/**
 * Callback de lista (§8): índice → `i()`, mini-corpo reativo (`let` lido no JSX do item → signal/state; `const`
 * derivado → memo). Marca o callback como função de fluxo.
 */
function registerListCallback(ctx: BodyContext, call: NodePath<t.CallExpression | t.OptionalCallExpression>): void {
  const st = stateOf(ctx)
  const cbPath = call.get('arguments')[0] as NodePath<t.Function>
  const cb = cbPath.node
  if (st.listCallbacks.has(cb)) return
  st.listCallbacks.add(cb)
  flowFns.add(cb)
  if (cb.params.length > 2) ctx.mod.notImplemented(cb.params[2]!, 'terceiro parâmetro (`array`) no `.map` de lista')
  const index = cb.params[1]
  if (index) {
    if (!t.isIdentifier(index)) return ctx.mod.notImplemented(index, 'índice de lista desestruturado ou com default')
    const b = cbPath.scope.getBinding(index.name)
    if (b) {
      const name = index.name
      ctx.rules.set(b.identifier, {
        read: () => {
          const callee = gid(name)
          indexCallees.add(callee)
          return t.callExpression(callee, [])
        },
      })
    }
  }
  // mini-corpo do item (só declarações do bloco raiz do callback)
  const body = cbPath.get('body')
  if (!body.isBlockStatement()) return
  for (const s of body.get('body')) {
    if (!s.isVariableDeclaration() || s.node.kind === 'var') continue
    for (const d of s.get('declarations')) {
      const id = d.node.id
      if (!t.isIdentifier(id)) continue
      const b = d.scope.getBinding(id.name)
      if (!b) continue
      let kind: 'signal' | 'state' | 'memo' | null = null
      if (s.node.kind === 'let') {
        if (!b.referencePaths.some((r) => isLiveInItem(r, cb))) continue
        const init = d.node.init
        const primitive =
          (!init || isProbablyPrimitive(init)) && b.constantViolations.every((v) => assignmentIsPrimitive(v))
        kind = primitive ? 'signal' : 'state'
      } else if (d.node.init && isDerivedInit(d.node.init, d.scope, ctx)) kind = 'memo'
      if (!kind) continue
      st.itemDecls.set(d.node, kind)
      ctx.rules.set(b.identifier, signalRule(id.name, kind !== 'memo'))
    }
  }
}

/**
 * `await` do escopo raiz (§10): `const x = await e` / `let x = await e` / `const [a, b] = await e` / `await e;`.
 * Leituras de `x` → `_rN.value.get()` (folhas de desestruturação: `_rN.value.get()[0]`); `let x` → `x = v` vira
 * `_rN.value.set(v)` (D36: sobrescrita local; `x.campo = v` passa pelo proxy).
 */
function registerAwait(ctx: BodyContext, node: t.AwaitExpression): void {
  const st = stateOf(ctx)
  const fn = ctx.fn!
  const s = rootStatementOf(ctx, node)
  let declarator: t.VariableDeclarator | null = null
  if (s && t.isVariableDeclaration(s) && s.declarations.length === 1 && s.declarations[0]!.init === node)
    declarator = s.declarations[0]!
  else if (!(s && t.isExpressionStatement(s) && s.expression === node))
    return ctx.mod.notImplemented(
      node,
      '`await` no corpo do componente fora de `const x = await …` / `await …;` (um `await` por statement)',
    )
  const name = ctx.name('_r', true)
  st.awaits.set(s, { name, node, declarator })
  if (!declarator) return
  const isLet = (s as t.VariableDeclaration).kind === 'let'
  const value = () => callMethod(member(gid(name), 'value'), 'get')
  const set = (v: t.Expression) => callMethod(member(gid(name), 'value'), 'set', [v])
  const id = declarator.id
  if (t.isIdentifier(id)) {
    const b = fn.scope.getBinding(id.name)
    if (!b) return
    const rule: Rule = { read: value }
    if (isLet) rule.write = set
    ctx.rules.set(b.identifier, rule)
    ctx.resources.set(b.identifier, name)
    return
  }
  // `const [a, b] = await Promise.all(…)` → um recurso; `a` → `_rN.value.get()[0]` (§10.5)
  const out: Leaf[] = []
  leaves(ctx, id, value, out)
  for (const leaf of out) {
    const b = fn.scope.getBinding(leaf.id.name)
    if (!b) continue
    const rule: Rule = { read: leaf.access }
    // `let [a] = await …; a = v` → `_rN.value.get()[0] = v` (escrita no proxy do valor)
    if (isLet)
      rule.target = () => {
        const e = leaf.access()
        return t.isLogicalExpression(e) ? e.left : e
      }
    ctx.rules.set(b.identifier, rule)
    ctx.resources.set(b.identifier, name)
  }
}

/** `await` que sobrou fora dos pontos do escopo raiz (ex.: `return <p>{await x}</p>`): sem forma de emitir. */
function checkStrayAwaits(ctx: BodyContext): void {
  const st = stateOf(ctx)
  const known = new Set<t.Node>([...st.awaits.values()].map((a) => a.node))
  const fn = ctx.fn!
  fn.traverse({
    Function(p) {
      p.skip()
    },
    AwaitExpression(p) {
      if (!known.has(p.node)) ctx.mod.notImplemented(p.node, '`await` fora de um statement do escopo raiz')
    },
    ForOfStatement(p) {
      if (p.node.await) ctx.mod.notImplemented(p.node, '`for await` no corpo do componente')
    },
  })
}

/** Valida o fluxo do corpo e registra o que precisa existir antes da reescrita de §4. */
export function checkBodyFlow(ctx: BodyContext): void {
  const body = ctx.body!
  const st = stateOf(ctx)
  for (const f of body.flow) {
    if (f.kind === 'await') registerAwait(ctx, f.node)
    if (f.kind === 'return') {
      const s = rootStatementOf(ctx, f.node)
      if (s) st.decisions.add(s)
      if (f.node.argument) ctx.dataJo.add(f.node.argument)
    }
  }
  if (body.isAsync || st.awaits.size) checkStrayAwaits(ctx)

  // listas: `.map` com JSX em filho de elemento e `const rows = xs.map(…)`
  for (const info of body.bindings.values()) {
    const d = info.declarator
    if (info.kind !== 'list' || !t.isIdentifier(d.id) || !d.init || !isListExpression(d.init)) continue
    const name = ctx.name(`_${d.id.name}`)
    st.listConsts.set(d, name)
    st.listConstNames.add(name)
  }
  ctx.fn!.traverse({
    'CallExpression|OptionalCallExpression'(p) {
      const call = p as NodePath<t.CallExpression | t.OptionalCallExpression>
      if (!isListExpression(call.node)) return
      const parent = call.parentPath
      const isConst = parent.isVariableDeclarator() && st.listConsts.has(parent.node)
      if (isConst || isElementChild(call)) registerListCallback(ctx, call)
    },
  })
  for (const [d, name] of st.listConsts) {
    const id = d.id as t.Identifier
    const b = ctx.fn!.scope.getBinding(id.name)
    if (!b) continue
    for (const r of b.referencePaths) {
      if (!isElementChild(r))
        ctx.mod.notImplemented(r.node, `\`const\` de lista (\`${id.name}\`) fora de posição de filho de elemento`)
    }
    ctx.rules.set(b.identifier, { read: () => gid(name) })
  }
}

// ─── Fase 2: depois da reescrita ─────────────────────────────────────────────

/** Condição já booleana (`!x`, comparação…) não ganha `!!` (como em compiled/02 e /04). */
function isBooleanish(e: t.Expression): boolean {
  if (t.isBooleanLiteral(e)) return true
  if (t.isUnaryExpression(e)) return e.operator === '!'
  if (t.isBinaryExpression(e))
    return ['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'instanceof', 'in'].includes(e.operator)
  if (t.isLogicalExpression(e) && e.operator !== '??') return isBooleanish(e.left) && isBooleanish(e.right)
  return false
}

function cond(e: t.Expression): t.ArrowFunctionExpression {
  return arrow(isBooleanish(e) ? e : t.unaryExpression('!', t.unaryExpression('!', e)))
}

/** Função de render marcada como fluxo. */
function flowArrow(body: t.Expression | t.BlockStatement): t.ArrowFunctionExpression {
  const fn = arrow(body)
  flowFns.add(fn)
  return fn
}

/**
 * Valor de um caso: JSX (compilado na próxima rodada) e literais como estão; expressão dinâmica vira accessor
 * (o render roda sem rastrear; o accessor mantém o texto vivo enquanto o caso está ativo).
 */
function renderValue(e: t.Expression | null | undefined): t.Expression {
  if (!e) return t.nullLiteral()
  if (isJSX(e) || isLiteralValue(e) || t.isFunction(e) || !isDynamic(e)) return e
  return arrow(e)
}

type Case = [t.Expression, t.Expression]

function branchesCall(ctx: BodyContext, cases: Case[], fallback: t.Expression | null): t.CallExpression {
  const args: t.Expression[] = [t.arrayExpression(cases.map(([c, r]) => t.arrayExpression([c, r])))]
  if (fallback) args.push(fallback)
  return ctx.mod.call('branches', args)
}

/** `cond ? X : Y`, `a && X`, `a || X`, `a ?? X`, `{…}[s]` → casos + fallback (§7). */
function conditionalCases(e: t.Expression): { cases: Case[]; fallback: t.Expression | null } {
  if (t.isConditionalExpression(e)) {
    const head: Case = [cond(e.test), flowArrow(renderValue(e.consequent))]
    const alt = e.alternate
    if (isConditionalChild(alt) && !isIndexedObject(alt)) {
      const rest = conditionalCases(alt)
      return { cases: [head, ...rest.cases], fallback: rest.fallback }
    }
    const none = t.isNullLiteral(alt) || t.isIdentifier(alt, { name: 'undefined' }) || t.isBooleanLiteral(alt)
    return { cases: [head], fallback: none ? null : flowArrow(renderValue(alt)) }
  }
  if (t.isLogicalExpression(e)) {
    const right = flowArrow(renderValue(e.right))
    if (e.operator === '&&') return { cases: [[cond(e.left), right]], fallback: null }
    const left = e.left
    const test =
      e.operator === '??' ? arrow(t.binaryExpression('!=', t.cloneNode(left, true), t.nullLiteral())) : cond(left)
    return { cases: [[test, flowArrow(renderValue(t.cloneNode(left, true)))]], fallback: right }
  }
  // objeto de JSX indexado
  const m = e as t.MemberExpression & { object: t.ObjectExpression }
  const cases: Case[] = []
  for (const p of m.object.properties) {
    if (!t.isObjectProperty(p) || p.computed) throw new Error('unreachable')
    const key = t.isIdentifier(p.key) ? p.key.name : t.isStringLiteral(p.key) ? p.key.value : String(literalKey(p.key))
    const test = t.binaryExpression('===', t.cloneNode(m.property as t.Expression, true), t.stringLiteral(key))
    cases.push([arrow(test), flowArrow(renderValue(p.value as t.Expression))])
  }
  return { cases, fallback: null }
}

function literalKey(k: t.Node): string | number {
  return t.isNumericLiteral(k) ? k.value : ''
}

/**
 * Valor de um `{expr}` em posição de filho: condicional com JSX → `branches(...)`; resto → accessor `() => expr`
 * (função como está). Listas em filho de elemento não passam por aqui (`listStatement`); fora disso (fragmento,
 * children de componente, dentro de condicional) a lista é um accessor comum: recria tudo quando a fonte muda.
 */
export function childValue(path: NodePath<t.Expression>, ctx: BodyContext): t.Expression {
  const expr = path.node
  if (isConditionalChild(expr)) {
    if (isIndexedObject(expr)) {
      for (const p of expr.object.properties) {
        if (!t.isObjectProperty(p) || p.computed)
          ctx.mod.notImplemented(p, 'objeto de JSX indexado com chave computada, método ou spread')
      }
    }
    const { cases, fallback } = conditionalCases(expr)
    return branchesCall(ctx, cases, fallback)
  }
  if (isListConstRef(expr, ctx))
    return ctx.mod.notImplemented(expr, '`const` de lista fora de posição de filho de elemento')
  if (t.isFunction(expr)) return expr
  return arrow(expr)
}

// ─── Listas (§8) ─────────────────────────────────────────────────────────────

function isListConstRef(expr: t.Node, ctx: BodyContext): expr is t.Identifier {
  return t.isIdentifier(expr) && isGenerated(expr) && stateOf(ctx).listConstNames.has(expr.name)
}

/** O `{expr}` deste filho de elemento vira `list(...)`/`_rows(...)` (statement, não valor de `insert`)? */
export function isListChild(path: NodePath<t.Expression>, ctx: BodyContext): boolean {
  const n = path.node
  if (isListConstRef(n, ctx)) return true
  if (!isListExpression(n)) return false
  const cb = n.arguments[0]
  return !!cb && stateOf(ctx).listCallbacks.has(cb as t.Function)
}

/** Expressões raiz devolvidas pelo callback (corpo-expressão ou `return`s fora de funções aninhadas). */
function returnedRoots(cb: t.Function): t.Expression[] {
  if (!t.isBlockStatement(cb.body)) return [cb.body as t.Expression]
  const out: t.Expression[] = []
  some(cb.body, (n) => {
    if (t.isReturnStatement(n) && n.argument) out.push(n.argument)
    return false
  })
  return out
}

/** Desfaz `i()` → `i` (a função de `key` recebe o índice numérico). */
function unwrapIndex(e: t.Expression): t.Expression {
  const visit = (n: t.Node): t.Node => {
    if (t.isCallExpression(n) && n.arguments.length === 0 && indexCallees.has(n.callee)) return n.callee
    for (const key of t.VISITOR_KEYS[n.type] ?? []) {
      const child = (n as unknown as Record<string, unknown>)[key]
      if (Array.isArray(child))
        child.forEach((c, i) => {
          if (c && typeof c === 'object' && 'type' in c) child[i] = visit(c as t.Node)
        })
      else if (child && typeof child === 'object' && 'type' in child)
        (n as unknown as Record<string, unknown>)[key] = visit(child as t.Node)
    }
    return n
  }
  return visit(e) as t.Expression
}

/** `key={k}` na raiz do item: removido do JSX; vira `(item, i) => k` (18 §8). */
function extractKey(cb: t.Function): t.ArrowFunctionExpression | null {
  let key: t.Expression | null = null
  for (const root of returnedRoots(cb)) {
    if (!t.isJSXElement(root)) continue
    const attrs = root.openingElement.attributes
    const i = attrs.findIndex((a) => t.isJSXAttribute(a) && attrName(a) === 'key')
    if (i < 0) continue
    const a = attrs[i] as t.JSXAttribute
    attrs.splice(i, 1)
    if (key) continue
    if (t.isStringLiteral(a.value)) key = a.value
    else if (t.isJSXExpressionContainer(a.value) && !t.isJSXEmptyExpression(a.value.expression))
      key = a.value.expression
  }
  if (!key) return null
  const params = cb.params.map((p) => t.cloneNode(p, true)) as t.Identifier[]
  return arrow(unwrapIndex(key), params)
}

/** Argumentos de `list` depois de `parent, marker`: `() => SRC`, render, key?, dev?. */
function listArgs(
  ctx: BodyContext,
  call: t.CallExpression | t.OptionalCallExpression,
  name: string | undefined,
  locNode: t.Node,
): t.Expression[] {
  const callee = call.callee as t.MemberExpression | t.OptionalMemberExpression
  let source = callee.object
  if (t.isOptionalMemberExpression(callee) || t.isOptionalCallExpression(call))
    source = t.logicalExpression('??', source, t.arrayExpression([]))
  const cb = call.arguments[0] as t.ArrowFunctionExpression | t.FunctionExpression
  const key = extractKey(cb)
  const meta = ctx.mod.meta(name, locNode)
  const args: t.Expression[] = [arrow(source), cb]
  if (key || meta) args.push(key ?? t.identifier('undefined'))
  if (meta) args.push(meta)
  return args
}

/** `{xs.map(…)}` / `{rows}` em filho de elemento → `list(parent, marker, …)` / `_rows(parent, marker)`. */
export function listStatement(ctx: BodyContext, expr: t.Expression, parent: string, marker: string | null) {
  const m = marker ? gid(marker) : t.nullLiteral()
  if (isListConstRef(expr, ctx)) return t.expressionStatement(t.callExpression(gid(expr.name), [gid(parent), m]))
  const call = expr as t.CallExpression
  return t.expressionStatement(ctx.mod.call('list', [gid(parent), m, ...listArgs(ctx, call, undefined, call)]))
}

/** `const rows = xs.map(…)` → `const _rows = (parent, marker) => list(parent, marker, …)` (18 §8). */
export function emitListConst(ctx: BodyContext, d: t.VariableDeclarator): t.Statement[] | null {
  const name = stateOf(ctx).listConsts.get(d)
  if (!name || !d.init || !isListExpression(d.init)) return null
  const parent = ctx.name('parent')
  const marker = ctx.name('marker')
  const id = d.id as t.Identifier
  const body = ctx.mod.call('list', [gid(parent), gid(marker), ...listArgs(ctx, d.init, id.name, id)])
  return [t.variableDeclaration('const', [t.variableDeclarator(gid(name), arrow(body, [gid(parent), gid(marker)]))])]
}

/** Mini-corpo dos itens: `let x = 0` → `const x = signal(0, dev)`, `const y = item.a + 1` → `memo(…)`. */
function emitItemDecls(ctx: BodyContext): void {
  const st = stateOf(ctx)
  if (!st.itemDecls.size) return
  for (const cb of st.listCallbacks) {
    if (!t.isBlockStatement(cb.body)) continue
    const out: t.Statement[] = []
    for (const s of cb.body.body) {
      if (!t.isVariableDeclaration(s) || !s.declarations.some((d) => st.itemDecls.has(d))) {
        out.push(s)
        continue
      }
      for (const d of s.declarations) {
        const kind = st.itemDecls.get(d)
        if (!kind) {
          out.push(t.variableDeclaration(s.kind, [d]))
          continue
        }
        const name = (d.id as t.Identifier).name
        const init = d.init ?? t.identifier('undefined')
        const args: t.Expression[] = [kind === 'memo' ? arrow(init) : init]
        const meta = ctx.mod.meta(name, d.id)
        if (meta) args.push(meta)
        out.push(t.variableDeclaration('const', [t.variableDeclarator(gid(name), ctx.mod.call(kind, args))]))
      }
    }
    cb.body.body = out
  }
}

// ─── Early return (§9) ───────────────────────────────────────────────────────

interface Decision {
  cases: Case[]
  /** Statements que formam o fallback (continuação); `null` = sem fallback. */
  rest: t.Statement[]
}

/** Render de um caso: `() => X` ou `() => { prelude; return X }`. */
function caseRender(prelude: t.Statement[], ret: t.ReturnStatement): t.ArrowFunctionExpression {
  const value = renderValue(ret.argument)
  if (!prelude.length) return flowArrow(value)
  return flowArrow(t.blockStatement([...prelude, t.returnStatement(value)]))
}

function ifDecision(s: t.IfStatement, rest: t.Statement[]): Decision {
  const cases: Case[] = []
  let cur: t.IfStatement = s
  for (;;) {
    const found = directReturn(cur.consequent)
    // `else if` sem `return` no meio da cadeia: daqui em diante é JS normal dentro da continuação
    if (!found) return { cases, rest: [cur, ...rest] }
    cases.push([cond(cur.test), caseRender(found.prelude, found.ret)])
    const alt = cur.alternate
    if (!alt) return { cases, rest }
    if (t.isIfStatement(alt)) {
      cur = alt
      continue
    }
    const elseBody = t.isBlockStatement(alt) ? alt.body : [alt]
    // `else { … return X }`: o que vem depois do `if` é inalcançável
    return { cases, rest: directReturn(alt) ? elseBody : [...elseBody, ...rest] }
  }
}

function switchDecision(s: t.SwitchStatement, rest: t.Statement[]): Decision {
  const cases: Case[] = []
  let pending: t.Expression[] = []
  let fallback: t.Statement[] | null = null
  for (const c of s.cases) {
    const found = caseReturn(c)
    if (!c.test) {
      if (found) fallback = [...found.prelude, found.ret]
      pending = []
      continue
    }
    pending.push(c.test)
    if (!found) continue
    const tests = pending.map((test) => t.binaryExpression('===', t.cloneNode(s.discriminant, true), test))
    const test = tests.slice(1).reduce<t.Expression>((acc, e) => t.logicalExpression('||', acc, e), tests[0]!)
    cases.push([arrow(test), caseRender(found.prelude, found.ret)])
    pending = []
  }
  return { cases, rest: fallback ?? rest }
}

/**
 * Reestrutura uma sequência de statements: setup, depois `return branches(casos, () => { continuação })`. Pontos de
 * decisão consecutivos (sem nada entre eles) se fundem no mesmo `branches` (compiled/04).
 */
function sequence(ctx: BodyContext, stmts: t.Statement[]): t.Statement[] {
  const st = stateOf(ctx)
  const k = stmts.findIndex((s) => st.decisions.has(s) || st.awaits.has(s))
  if (k < 0) return stmts
  const setup = stmts.slice(0, k)
  const aw = st.awaits.get(stmts[k]!)
  if (aw) return [...setup, ...awaitStatements(ctx, aw, stmts.slice(k + 1))]
  const cases: Case[] = []
  let rest: t.Statement[] = stmts.slice(k + 1)
  let s: t.Statement | undefined = stmts[k]
  while (s && st.decisions.has(s)) {
    const d: Decision = t.isIfStatement(s) ? ifDecision(s, rest) : switchDecision(s as t.SwitchStatement, rest)
    cases.push(...d.cases)
    rest = d.rest
    s = rest[0]
    if (s && st.decisions.has(s)) rest = rest.slice(1)
    else break
  }
  return [...setup, t.returnStatement(branchesCall(ctx, cases, continuationOf(ctx, rest)))]
}

/**
 * `const x = await e; resto` → `const _rN = resource(() => e', dev); return continuation(_rN, () => { resto })`
 * (§10.1–§10.4). A expressão já foi reescrita (§4): o efeito do recurso assina o que ela lê.
 */
function awaitStatements(ctx: BodyContext, aw: AwaitPoint, rest: t.Statement[]): t.Statement[] {
  const mod = ctx.mod
  const d = aw.declarator
  const label = d ? Object.keys(t.getBindingIdentifiers(d.id)).join(', ') : undefined
  const meta = mod.meta(label, d ? d.id : aw.node)
  const args: t.Expression[] = [arrow(aw.node.argument)]
  if (meta) args.push(meta)
  const decl = t.variableDeclaration('const', [t.variableDeclarator(gid(aw.name), mod.call('resource', args))])
  const fn = continuationOf(ctx, rest) ?? flowArrow(t.nullLiteral())
  return [decl, t.returnStatement(mod.call('continuation', [gid(aw.name), fn]))]
}

/** `branches(…)`/`continuation(…)` gerados: já são o valor de render (não viram accessor). */
function isFlowCall(e: t.Node | null | undefined): boolean {
  return t.isCallExpression(e) && isGenerated(e.callee)
}

/** Fallback a partir dos statements da continuação. */
function continuationOf(ctx: BodyContext, stmts: t.Statement[]): t.Expression | null {
  if (!stmts.length) return null
  const body = sequence(ctx, stmts)
  const only = body[0]
  if (body.length === 1 && t.isReturnStatement(only))
    return flowArrow(isFlowCall(only.argument) ? only.argument! : renderValue(only.argument))
  // statements depois do `return` final são inalcançáveis
  const end = body.findIndex((x) => t.isReturnStatement(x))
  const live = end >= 0 ? body.slice(0, end + 1) : body
  const last = live[live.length - 1]
  if (t.isReturnStatement(last) && !isFlowCall(last.argument))
    live[live.length - 1] = t.returnStatement(renderValue(last.argument))
  return flowArrow(t.blockStatement(live))
}

/**
 * Depois da reescrita e da emissão das declarações: mini-corpo dos itens e early return (§9) →
 * `return branches([...], () => { continuação; return <final> })`.
 */
export function emitBodyFlow(ctx: BodyContext): void {
  const st = stateOf(ctx)
  emitItemDecls(ctx)
  const fn = ctx.fn!
  const body = fn.node.body
  const restructure = st.decisions.size > 0 || st.awaits.size > 0
  if (restructure && t.isBlockStatement(body)) body.body = sequence(ctx, body.body)
  // a função compilada não é `async` (§10): o `await` virou `resource` + `continuation`
  fn.node.async = false
  // statements movidos para funções novas / `let` que viraram `const`: escopos do Babel refeitos para as rodadas de JSX
  if (restructure || st.itemDecls.size) fn.scope.crawl()
}
