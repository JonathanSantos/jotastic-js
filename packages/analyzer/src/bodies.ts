/** Detecção de corpos reativos (18 §1) e de JSX fora deles (18 §13). */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { AnalyzeOptions } from './types'
import { containsJSX, isUseName, walk } from './util'

export interface FoundBody {
  kind: 'component' | 'use'
  name: string
  path: NodePath<t.Function>
}

function isModuleLevel(stmt: NodePath): boolean {
  const parent = stmt.parentPath
  if (!parent) return false
  if (parent.isProgram()) return true
  return (parent.isExportNamedDeclaration() || parent.isExportDefaultDeclaration()) && !!parent.parentPath?.isProgram()
}

/** Nome do corpo e se está no escopo do módulo. */
function describe(fn: NodePath<t.Function>): { name: string; moduleLevel: boolean } | null {
  const node = fn.node
  if (fn.isFunctionDeclaration()) {
    const id = (node as t.FunctionDeclaration).id
    if (!id) return null
    return { name: id.name, moduleLevel: isModuleLevel(fn) }
  }
  if (!fn.isArrowFunctionExpression() && !fn.isFunctionExpression()) return null
  // sobe por parênteses / asserções de tipo
  let child: NodePath = fn
  let parent = fn.parentPath
  while (
    parent &&
    (parent.isParenthesizedExpression() ||
      parent.isTSAsExpression() ||
      parent.isTSSatisfiesExpression() ||
      parent.isTSNonNullExpression())
  ) {
    child = parent
    parent = parent.parentPath
  }
  if (!parent) return null
  if (parent.isVariableDeclarator() && t.isIdentifier(parent.node.id) && parent.node.init === child.node) {
    const decl = parent.parentPath!
    return { name: parent.node.id.name, moduleLevel: isModuleLevel(decl) }
  }
  if (parent.isAssignmentExpression() && parent.node.right === child.node) {
    const left = parent.node.left
    const own = t.isFunctionExpression(node) && node.id ? node.id.name : null
    if (t.isMemberExpression(left) && !left.computed && t.isIdentifier(left.property))
      return { name: own ?? left.property.name, moduleLevel: false }
  }
  if (parent.isExportDefaultDeclaration() && t.isFunctionExpression(node) && node.id)
    return { name: node.id.name, moduleLevel: true }
  return null
}

/** `true` se algum `return` (fora de funções aninhadas) ou o corpo-expressão contém JSX. */
export function returnsJSX(fn: t.Function): boolean {
  if (!t.isBlockStatement(fn.body)) return containsJSX(fn.body)
  let found = false
  walk(fn.body, (n) => {
    if (found) return false
    if (t.isReturnStatement(n) && n.argument && containsJSX(n.argument)) found = true
  })
  return found
}

export function findBodies(
  program: NodePath<t.Program>,
  options: AnalyzeOptions,
): { bodies: FoundBody[]; topLevelJSX: Array<t.JSXElement | t.JSXFragment> } {
  const bodies: FoundBody[] = []
  const topLevelJSX: Array<t.JSXElement | t.JSXFragment> = []
  program.traverse({
    Function(path) {
      const info = describe(path)
      if (info) {
        if (isUseName(info.name) && info.moduleLevel) {
          bodies.push({ kind: 'use', name: info.name, path })
          path.skip()
          return
        }
        if (options.isTSX && /^[A-Z]/.test(info.name) && returnsJSX(path.node)) {
          bodies.push({ kind: 'component', name: info.name, path })
          path.skip()
        }
      }
    },
    JSXElement(path) {
      topLevelJSX.push(path.node)
      path.skip()
    },
    JSXFragment(path) {
      topLevelJSX.push(path.node)
      path.skip()
    },
  })
  return { bodies, topLevelJSX }
}
