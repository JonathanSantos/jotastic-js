/** Escopo raiz de um corpo reativo: parâmetros, declarações, contexto vivo, atribuições e mutações (18 §2). */
import * as t from '@babel/types'
import type { Binding, NodePath } from '@babel/traverse'
import type { BindingKind, ParamInfo } from './types'
import type { FlowResult } from './flow'
import { eventName, isAssignable, twoWayCandidates, type TwoWayKind } from './jsx'
import { attrName, isUseName, jotasticCallee, memberRoot, unwrap } from './util'

export interface RootDecl {
  name: string
  binding: Binding
  declarator: NodePath<t.VariableDeclarator>
  statement: t.Statement
  isLet: boolean
}

export interface BodyScope {
  fn: NodePath<t.Function>
  kind: 'component' | 'use'
  params: ParamInfo[]
  /** Bindings de parâmetros (props desestruturadas, `props`, posicionais de `use*`) → nome. */
  paramBindings: Map<Binding, string>
  decls: RootDecl[]
  declByName: Map<string, RootDecl>
  /** Função raiz (declaração ou `const f = () => …`) → binding do nome. */
  rootFunctions: Map<t.Node, Binding>
  /** `let` do escopo raiz usados em `ref={x}`. */
  refLets: Set<string>
  /** `let` escritos implicitamente por two-way (`value={x}`), com o kind do `twoWay`. */
  twoWayLets: Map<string, TwoWayKind[]>
  /** Bindings raiz mutados por two-way (`value={todo.text}`). */
  twoWayMutated: Set<string>
}

/** Bindings com estado/derivado (18 §2, conjunto `R`), além dos parâmetros. */
export const REACTIVE_KINDS = new Set<BindingKind>([
  'signal',
  'state',
  'stateLiteral',
  'memo',
  'memoLiteral',
  'resource',
  'external',
  'useResult',
  'list',
])

/** `const` cujo inicializador é avaliado em contexto vivo. */
const LIVE_INIT_KINDS = new Set<BindingKind>(['memo', 'memoLiteral', 'list', 'resource', 'external', 'useResult'])

function patternParams(node: t.Node, kind: ParamInfo['kind'], out: ParamInfo[], defaultValue?: t.Node): void {
  if (t.isIdentifier(node)) out.push(defaultValue ? { name: node.name, kind, defaultValue } : { name: node.name, kind })
  else if (t.isAssignmentPattern(node)) patternParams(node.left, kind, out, node.right)
  else if (t.isRestElement(node)) patternParams(node.argument, 'rest', out)
  else if (t.isObjectPattern(node)) {
    for (const p of node.properties) {
      if (t.isRestElement(p)) patternParams(p.argument, 'rest', out)
      else patternParams(p.value, kind === 'positional' ? 'destructured' : kind, out)
    }
  } else if (t.isArrayPattern(node)) {
    for (const e of node.elements) if (e) patternParams(e, kind === 'positional' ? 'destructured' : kind, out)
  } else if (t.isTSParameterProperty(node)) patternParams(node.parameter, kind, out)
}

export function collectParams(fn: t.Function, kind: 'component' | 'use'): ParamInfo[] {
  const out: ParamInfo[] = []
  if (kind === 'component') {
    const p = fn.params[0]
    if (!p) return out
    if (t.isIdentifier(p)) out.push({ name: p.name, kind: 'propsObject' })
    else if (t.isAssignmentPattern(p) && t.isIdentifier(p.left))
      out.push({ name: p.left.name, kind: 'propsObject', defaultValue: p.right })
    else patternParams(t.isAssignmentPattern(p) ? p.left : p, 'destructured', out)
    return out
  }
  for (const p of fn.params) patternParams(p, 'positional', out)
  return out
}

export function collectScope(fn: NodePath<t.Function>, kind: 'component' | 'use'): BodyScope {
  const params = collectParams(fn.node, kind)
  const paramBindings = new Map<Binding, string>()
  for (const p of params) {
    const b = fn.scope.getBinding(p.name)
    if (b && b.kind === 'param') paramBindings.set(b, p.name)
  }
  const scope: BodyScope = {
    fn,
    kind,
    params,
    paramBindings,
    decls: [],
    declByName: new Map(),
    rootFunctions: new Map(),
    refLets: new Set(),
    twoWayLets: new Map(),
    twoWayMutated: new Set(),
  }
  const body = fn.get('body')
  if (!body.isBlockStatement()) return scope
  for (const stmt of body.get('body')) {
    if (stmt.isFunctionDeclaration() && stmt.node.id) {
      const b = stmt.scope.parent?.getBinding(stmt.node.id.name) ?? fn.scope.getBinding(stmt.node.id.name)
      if (b) scope.rootFunctions.set(stmt.node, b)
      continue
    }
    if (!stmt.isVariableDeclaration() || stmt.node.kind === 'var') continue
    const isLet = stmt.node.kind === 'let'
    for (const declarator of stmt.get('declarations')) {
      for (const name of Object.keys(declarator.getBindingIdentifiers())) {
        const binding = declarator.scope.getBinding(name)
        if (!binding) continue
        const decl: RootDecl = { name, binding, declarator, statement: stmt.node, isLet }
        scope.decls.push(decl)
        scope.declByName.set(name, decl)
      }
      const init = declarator.node.init && unwrap(declarator.node.init)
      if (!isLet && init && t.isFunction(init) && t.isIdentifier(declarator.node.id)) {
        const b = declarator.scope.getBinding(declarator.node.id.name)
        if (b) scope.rootFunctions.set(init, b)
      }
    }
  }
  fn.traverse({
    JSXOpeningElement(p) {
      for (const c of twoWayCandidates(p.node)) {
        if (!isAssignable(c.expr)) continue
        const e = unwrap(c.expr)
        const root = memberRoot(e)
        if (!t.isIdentifier(root)) continue
        const d = scope.declByName.get(root.name)
        if (!d || p.scope.getBinding(root.name) !== d.binding) continue
        if (root === e) {
          if (d.isLet) scope.twoWayLets.set(d.name, [...(scope.twoWayLets.get(d.name) ?? []), c.kind])
        } else scope.twoWayMutated.add(d.name)
      }
    },
    JSXAttribute(p) {
      if (attrName(p.node) !== 'ref') return
      const v = p.node.value
      if (!t.isJSXExpressionContainer(v)) return
      const e = unwrap(v.expression as t.Node)
      if (!t.isIdentifier(e)) return
      const d = scope.declByName.get(e.name)
      if (d && d.isLet && p.scope.getBinding(e.name) === d.binding) scope.refLets.add(e.name)
    },
  })
  return scope
}

export interface LiveContext {
  scope: BodyScope
  flow: FlowResult
  kinds: Map<string, BindingKind>
  fnLive: Map<Binding, boolean | 'pending'>
}

function declKindLive(ctx: LiveContext, declarator: t.VariableDeclarator): boolean | null {
  let found = false
  let isRoot = false
  for (const d of ctx.scope.decls) {
    if (d.declarator.node !== declarator) continue
    isRoot = true
    const k = ctx.kinds.get(d.name)
    if (k && LIVE_INIT_KINDS.has(k)) found = true
  }
  return isRoot ? found : null
}

function functionLive(ctx: LiveContext, binding: Binding): boolean {
  const cached = ctx.fnLive.get(binding)
  if (cached !== undefined) return cached === true
  ctx.fnLive.set(binding, 'pending')
  const live = binding.referencePaths.some((r) => isLiveRef(r, ctx))
  ctx.fnLive.set(binding, live)
  return live
}

/**
 * A leitura `ref` acontece em contexto vivo (18 §2)? JSX (menos handlers e `ref`), callbacks de `watch`/`inspect`/
 * `external`, alvo de `on`, argumentos de `use*`, inicializadores de `const` derivados, condições de early return,
 * expressões de `await`, o `return` do corpo (objeto de retorno de `use*`) e, transitivamente, o corpo de funções do
 * escopo raiz referenciadas em contexto vivo. Na dúvida, vivo (um signal a mais é sempre seguro).
 */
export function isLiveRef(ref: NodePath, ctx: LiveContext): boolean {
  const fnNode = ctx.scope.fn.node
  let child: NodePath = ref
  let cur: NodePath | null = ref.parentPath
  while (cur) {
    const n = cur.node
    if (n === fnNode) return child.node === fnNode.body // corpo-expressão de arrow: é o retorno
    if (ctx.flow.liveExpressions.has(child.node)) return true

    if (cur.isJSXAttribute()) {
      const name = attrName(cur.node)
      return !(name === 'ref' || eventName(name))
    }
    if (cur.isJSXExpressionContainer()) {
      if (!cur.parentPath?.isJSXAttribute()) return true
    } else if (cur.isJSXSpreadAttribute() || cur.isJSXSpreadChild() || cur.isJSXOpeningElement()) return true

    if (cur.isCallExpression() && child.listKey === 'arguments') {
      const api = jotasticCallee(cur)
      if (api === 'watch' || api === 'inspect' || api === 'external') return true
      if (api === 'on') return child.key === 0
      if (api === 'onMount' || api === 'onCleanup' || api === 'untrack') return false
      const callee = cur.node.callee
      if (t.isIdentifier(callee) && isUseName(callee.name)) return true
    }

    if (cur.isAwaitExpression()) {
      for (const f of ctx.flow.flow) if (f.kind === 'await' && f.node === n) return true
    }

    if (cur.isFunction()) {
      const b = ctx.scope.rootFunctions.get(n)
      if (b) return functionLive(ctx, b)
    }

    if (cur.isReturnStatement() && cur.getFunctionParent()?.node === fnNode) return true

    if (cur.isVariableDeclarator() && child.key === 'init') {
      const live = declKindLive(ctx, cur.node)
      if (live !== null) return live
    }

    // statement do escopo raiz: nada acima decide
    if (cur.parentPath?.node === fnNode.body) return false
    child = cur
    cur = cur.parentPath
  }
  return false
}

const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
])

/** `x.a = …`, `x.a++`, `delete x.a`, `x.list.push(…)` em qualquer profundidade. */
export function isMutated(binding: Binding): boolean {
  for (const ref of binding.referencePaths) {
    let top: NodePath = ref
    while (
      (top.parentPath?.isMemberExpression() || top.parentPath?.isOptionalMemberExpression()) &&
      top.key === 'object'
    )
      top = top.parentPath
    if (top === ref) continue
    const parent = top.parentPath
    if (!parent) continue
    if (parent.isAssignmentExpression() && top.key === 'left') return true
    if (parent.isUpdateExpression()) return true
    if (parent.isUnaryExpression({ operator: 'delete' })) return true
    if ((parent.isCallExpression() || parent.isOptionalCallExpression()) && top.key === 'callee') {
      const m = top.node as t.MemberExpression
      if (!m.computed && t.isIdentifier(m.property) && MUTATING_METHODS.has(m.property.name)) return true
    }
    if ((parent.isForOfStatement() || parent.isForInStatement()) && top.key === 'left') return true
  }
  return false
}
