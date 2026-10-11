/**
 * Controle de fluxo (18 §7–§10): condicionais, listas, early return e `await`. PARTE 2 do passo 5.
 *
 * Pontos de entrada já ligados à parte 1 (a parte 2 só troca o corpo destas funções):
 * - `checkBodyFlow(ctx)`: chamado antes da emissão de cada componente. Hoje lança se o analyzer achou pontos de
 *   decisão (`FlowNode` `return`/`await`). A parte 2 emite `branches`/`resource`/`continuation` aqui e marca
 *   `ctx.inFlow` ao compilar o JSX dos casos/continuações (liga `onCleanup` de `ref` e `autofocus(el)`).
 * - `isFlowChild(expr)`: decide se um `{…}` em posição de filho é fluxo (§7/§8).
 * - `childValue(path, ctx)`: valor que vai para `insert(parent, VALUE, marker)` (ou para o array de filhos de um
 *   componente/fragmento). Fluxo → hoje lança; a parte 2 devolve `branches(...)`/`list(...)`.
 *   Atenção: `list` não é um valor de `insert` (`list(parent, marker, …)` é um statement): a parte 2 deve tratar
 *   listas em `template.ts`, no ponto marcado com "gancho: list".
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { BodyContext } from '../context'
import { arrow, isJSX, some } from './util'

/** Contém JSX fora de funções aninhadas? */
function hasJSX(n: t.Node): boolean {
  return some(n, isJSX)
}

/** `SRC(.filter|…)*.map(fn)` com JSX no retorno de `fn` (18 §8). */
export function isListExpression(n: t.Node): boolean {
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

/** Expressão de filho que é condicional/lista/objeto de JSX indexado (18 §7, §8). */
export function isFlowChild(expr: t.Node): boolean {
  if (t.isConditionalExpression(expr)) return hasJSX(expr.consequent) || hasJSX(expr.alternate)
  if (t.isLogicalExpression(expr)) return hasJSX(expr.right)
  if (isListExpression(expr)) return true
  if (t.isMemberExpression(expr) && expr.computed && t.isObjectExpression(expr.object)) return hasJSX(expr.object)
  return false
}

/** `const rows = items.map(…)` usado como `{rows}` (18 §8). */
function isListConst(path: NodePath, ctx: BodyContext): boolean {
  if (!path.isIdentifier() || !ctx.body) return false
  const info = ctx.body.bindings.get(path.node.name)
  const b = path.scope.getBinding(path.node.name)
  return info?.kind === 'list' && !!b && b.path.node === info.declarator
}

/**
 * Valor de um `{expr}` em posição de filho: accessor `() => expr` (o runtime cria o efeito de render), função como
 * está. Fluxo → parte 2.
 */
export function childValue(path: NodePath<t.Expression>, ctx: BodyContext): t.Expression {
  const expr = path.node
  if (isFlowChild(expr)) {
    const what = isListExpression(expr) ? 'lista (`.map` com JSX)' : 'condicional com JSX (`&&`, `?:`, `||`)'
    return ctx.mod.notImplemented(expr, what)
  }
  if (isListConst(path, ctx)) return ctx.mod.notImplemented(expr, '`const` de lista usado no JSX')
  if (t.isFunction(expr)) return expr
  return arrow(expr)
}

/** Early return e `await` no escopo raiz (18 §9, §10). */
export function checkBodyFlow(ctx: BodyContext): void {
  const body = ctx.body!
  for (const f of body.flow) {
    if (f.kind === 'return') ctx.mod.notImplemented(f.node, 'early return (`if (…) return <X/>`)')
    if (f.kind === 'await') ctx.mod.notImplemented(f.node, '`await` no corpo do componente')
  }
  if (body.isAsync) ctx.mod.notImplemented(body.node, 'componente `async`')
}
