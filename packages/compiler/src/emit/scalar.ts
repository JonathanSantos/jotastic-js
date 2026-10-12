/**
 * Escalares em posição de filho (D64, 18 §5.1): `{expr}` provavelmente primitivo, ou leitura simples de signal/memo/
 * prop cujo inicializador é primitivo, vira `text(marker, read)` em vez de `insert`. Marcado antes da reescrita de §4
 * (a decisão olha os bindings do código do usuário); `template.ts` lê a marca no `JSXExpressionContainer`.
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import { isProbablyPrimitive } from '@jotastic/analyzer'
import type { BodyContext } from '../context'
import { itemDeclKind } from './flow'
import { isIntrinsic } from './util'

/** Default primitivo de uma prop desestruturada (`{ step = 1 }`), procurado no padrão do parâmetro. */
function hasPrimitiveDefault(pattern: t.Node | undefined, id: t.Node): boolean {
  let found = false
  if (!pattern) return false
  t.traverseFast(pattern, (n) => {
    if (t.isAssignmentPattern(n) && n.left === id && isProbablyPrimitive(n.right)) found = true
  })
  return found
}

/**
 * `true` se `p` é escalar. Mais estrito que `isProbablyPrimitive` em `a || b` / `a ?? b`: o lado esquerdo também
 * precisa ser escalar (um Node em `a` renderizaria "[object HTMLElement]" num Text).
 */
function scalar(ctx: BodyContext, p: NodePath, seen: Set<t.Node>): boolean {
  const n = p.node
  if (
    t.isTSAsExpression(n) ||
    t.isTSNonNullExpression(n) ||
    t.isTSSatisfiesExpression(n) ||
    t.isParenthesizedExpression(n)
  )
    return scalar(ctx, p.get('expression') as NodePath, seen)
  if (
    t.isStringLiteral(n) ||
    t.isNumericLiteral(n) ||
    t.isBooleanLiteral(n) ||
    t.isNullLiteral(n) ||
    t.isBigIntLiteral(n) ||
    t.isTemplateLiteral(n) ||
    t.isUnaryExpression(n) ||
    t.isBinaryExpression(n) ||
    t.isUpdateExpression(n)
  )
    return true
  if (t.isIdentifier(n)) {
    if (n.name === 'undefined' || n.name === 'NaN' || n.name === 'Infinity') return !p.scope.getBinding(n.name)
    return scalarBinding(ctx, p as NodePath<t.Identifier>, seen)
  }
  if (t.isLogicalExpression(n)) {
    const right = scalar(ctx, p.get('right') as NodePath, seen)
    // `a && b`: os valores falsy de `a` já são primitivos
    return n.operator === '&&' ? right : right && scalar(ctx, p.get('left') as NodePath, seen)
  }
  if (t.isConditionalExpression(n))
    return scalar(ctx, p.get('consequent') as NodePath, seen) && scalar(ctx, p.get('alternate') as NodePath, seen)
  // `x.length`, métodos conhecidos de string/number, `Math.*`…
  if (
    t.isMemberExpression(n) ||
    t.isOptionalMemberExpression(n) ||
    t.isCallExpression(n) ||
    t.isOptionalCallExpression(n)
  )
    return isProbablyPrimitive(n)
  return false
}

/** Leitura simples de signal, memo com inicializador escalar ou prop com default primitivo. */
function scalarBinding(ctx: BodyContext, p: NodePath<t.Identifier>, seen: Set<t.Node>): boolean {
  const b = p.scope.getBinding(p.node.name)
  if (!b) return false
  if (ctx.propBindings.has(b.identifier)) return hasPrimitiveDefault(ctx.fn!.node.params[0], b.identifier)
  const d = b.path
  // `seen`: memos no caminho atual (ciclo → não prova)
  if (!d.isVariableDeclarator() || !t.isIdentifier(d.node.id) || seen.has(d.node)) return false
  const root = ctx.body!.bindings.get(p.node.name)
  const kind = root && root.declarator === d.node ? root.kind : itemDeclKind(ctx, d.node)
  if (kind === 'signal') return true
  if (kind !== 'memo' || !d.node.init) return false
  seen.add(d.node)
  const ok = scalar(ctx, d.get('init') as NodePath, seen)
  seen.delete(d.node)
  return ok
}

/** Marca os `{expr}` escalares em filho de elemento intrínseco (antes da reescrita). */
export function markText(ctx: BodyContext): void {
  ctx.fn!.traverse({
    JSXExpressionContainer(p) {
      if (p.listKey !== 'children') return
      const parent = p.parentPath
      if (!parent.isJSXElement() || !isIntrinsic(parent.node.openingElement.name)) return
      const e = p.get('expression')
      if (e.isJSXEmptyExpression()) return
      if (scalar(ctx, e as NodePath, new Set())) ctx.mod.textContainers.add(p.node)
    },
  })
}
