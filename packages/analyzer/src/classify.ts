/** Classificação dos declaradores do escopo raiz (18 §3). */
import * as t from '@babel/types'
import type { Binding, NodePath } from '@babel/traverse'
import type { BindingInfo, BindingKind } from './types'
import type { FlowResult } from './flow'
import { returnsJSX } from './bodies'
import { isProbablyPrimitive } from './jsx'
import { REACTIVE_KINDS, isLiveRef, type BodyScope, type LiveContext, type RootDecl } from './scope'
import { findAwaits, importedName, isJSXNode, isUseCall, memberRoot, unwrap, walk, within } from './util'

export interface Classification {
  bindings: Map<string, BindingInfo>
  liveReads: Set<string>
  /** Contexto final (kinds estáveis) para consultas de vivacidade nos diagnósticos. */
  ctx: LiveContext
  /** Nomes reativos (params + bindings reativos) lidos dentro de `node`. */
  reactiveReadsIn: (node: t.Node, opts?: { skipFunctions?: boolean }) => Set<string>
  /** Todos os nomes do escopo raiz (params + declarações + funções raiz) lidos dentro de `node`. */
  rootReadsIn: (node: t.Node) => Set<string>
}

/** `SRC(.filter|…)*.map(fn)` com JSX no retorno de `fn` (18 §8). */
export function isListExpression(node: t.Node): boolean {
  const n = unwrap(node)
  if (!t.isCallExpression(n) && !t.isOptionalCallExpression(n)) return false
  const callee = unwrap(n.callee)
  if (!(t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) || callee.computed) return false
  if (!t.isIdentifier(callee.property) || callee.property.name !== 'map') return false
  const cb = n.arguments[0] && unwrap(n.arguments[0])
  return !!cb && t.isFunction(cb) && returnsJSX(cb)
}

function hasGetter(o: t.ObjectExpression): boolean {
  return o.properties.some((p) => t.isObjectMethod(p) && p.kind === 'get')
}

function assignmentIsPrimitive(v: NodePath, name: string, isPrimitiveId: (id: t.Identifier) => boolean): boolean {
  if (v.isUpdateExpression()) return true
  if (v.isAssignmentExpression()) {
    const { left, right, operator } = v.node
    if (!t.isIdentifier(left) || left.name !== name) return false
    if (operator === '=' || operator === '||=' || operator === '&&=' || operator === '??=')
      return isProbablyPrimitive(right, isPrimitiveId)
    return true // aritméticos compostos
  }
  return false
}

export function classifyBody(scope: BodyScope, flow: FlowResult): Classification {
  // entradas: parâmetros + declarações, com todas as leituras
  interface Entry {
    name: string
    binding: Binding
    isParam: boolean
  }
  const entries: Entry[] = []
  for (const [b, name] of scope.paramBindings) entries.push({ name, binding: b, isParam: true })
  for (const d of scope.decls) entries.push({ name: d.name, binding: d.binding, isParam: false })

  let kinds = new Map<string, BindingKind>()
  const isReactive = (e: Entry) => e.isParam || REACTIVE_KINDS.has(kinds.get(e.name) ?? 'plain')

  const readsIn = (node: t.Node, filter: (e: Entry) => boolean, skipFunctions = false): Set<string> => {
    const out = new Set<string>()
    for (const e of entries) {
      if (!filter(e)) continue
      for (const r of e.binding.referencePaths) {
        if (!within(r.node, node)) continue
        if (skipFunctions && r.node !== node) {
          let p = r.parentPath
          let inFn = false
          while (p && p.node !== node) {
            if (p.isFunction()) inFn = true
            p = p.parentPath
          }
          if (inFn) continue
        }
        out.add(e.name)
        break
      }
    }
    return out
  }

  const fnBindings = new Set(scope.rootFunctions.values())

  // D60: identificador que lê outro `let` já classificado `signal` também é primitivo (ponto fixo mínimo).
  let signalRefs = new Set<t.Node>()
  const isPrimitiveId = (id: t.Identifier) => signalRefs.has(id)

  const classify = (d: RootDecl, liveLets: Set<string>): BindingKind => {
    const init = d.declarator.node.init
    if (init && findAwaits(init).length > 0) return 'resource'
    if (d.isLet) {
      if (scope.refLets.has(d.name)) return 'ref'
      if (!liveLets.has(d.name)) return 'plain'
      const primitive =
        t.isIdentifier(d.declarator.node.id) &&
        (!init || isProbablyPrimitive(init, isPrimitiveId)) &&
        d.binding.constantViolations.every((v) => assignmentIsPrimitive(v, d.name, isPrimitiveId)) &&
        !(scope.twoWayLets.get(d.name) ?? []).includes('multiple')
      return primitive ? 'signal' : 'state'
    }
    if (!init) return 'plain'
    const u = unwrap(init)
    if (t.isFunction(u)) return 'function'
    if (isJSXNode(u)) return 'jsx'
    if (isListExpression(u)) return 'list'
    if (t.isCallExpression(u) && t.isIdentifier(u.callee) && importedName(d.declarator, u.callee.name) === 'external')
      return 'external'
    // I-3: `useContext(Ctx)` lê o memo do Provider → o `const` que o recebe é derivado (reativo), não `useResult`
    if (t.isCallExpression(u) && t.isIdentifier(u.callee) && importedName(d.declarator, u.callee.name) === 'useContext')
      return 'memo'
    if (isUseCall(u)) return 'useResult'
    if (t.isIdentifier(d.declarator.node.id) && (t.isObjectExpression(u) || t.isArrayExpression(u))) {
      if (t.isObjectExpression(u) && hasGetter(u)) return 'memoLiteral'
      return readsIn(init, isReactive, true).size > 0 ? 'memo' : 'stateLiteral'
    }
    if (readsIn(init, isReactive).size > 0) return 'memo'
    let impure = false
    walk(init, (n) => {
      if (impure) return false
      if (
        t.isCallExpression(n) ||
        t.isOptionalCallExpression(n) ||
        t.isNewExpression(n) ||
        t.isTaggedTemplateExpression(n)
      )
        impure = true
      else if (t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) {
        const root = memberRoot(n)
        if (t.isIdentifier(root) && d.declarator.scope.getBinding(root.name)?.kind === 'module') impure = true
      }
    })
    if (impure) return 'memo'
    // `const { a, b } = store` desestrutura um import: acesso a membro implícito
    if (
      !t.isIdentifier(d.declarator.node.id) &&
      t.isIdentifier(u) &&
      d.declarator.scope.getBinding(u.name)?.kind === 'module'
    )
      return 'memo'
    return 'plain'
  }

  const makeCtx = (): LiveContext => ({ scope, flow, kinds, fnLive: new Map() })
  let liveLets = new Set(scope.decls.filter((d) => d.isLet).map((d) => d.name))
  let ctx = makeCtx()
  const classifyAll = () => {
    signalRefs = new Set()
    for (let pass = 0; pass < 50; pass++) {
      kinds = new Map()
      for (const d of scope.decls) kinds.set(d.name, classify(d, liveLets))
      const next = new Set<t.Node>()
      for (const d of scope.decls)
        if (d.isLet && kinds.get(d.name) === 'signal') for (const r of d.binding.referencePaths) next.add(r.node)
      if (next.size === signalRefs.size) break
      signalRefs = next
    }
  }
  for (let guard = 0; guard < 50; guard++) {
    classifyAll()
    ctx = makeCtx()
    const next = new Set<string>()
    for (const d of scope.decls) {
      if (d.isLet && liveLets.has(d.name) && d.binding.referencePaths.some((r) => isLiveRef(r, ctx))) next.add(d.name)
    }
    if (next.size === liveLets.size) break
    liveLets = next
  }

  const liveReads = new Set<string>()
  for (const d of scope.decls) if (d.binding.referencePaths.some((r) => isLiveRef(r, ctx))) liveReads.add(d.name)

  const bindings = new Map<string, BindingInfo>()
  for (const d of scope.decls) {
    const kind = kinds.get(d.name)!
    const init = d.declarator.node.init
    const reads = init ? readsIn(init, isReactive) : new Set<string>()
    bindings.set(d.name, {
      name: d.name,
      kind,
      declarator: d.declarator.node,
      isLet: d.isLet,
      reassigned: d.binding.constantViolations.length > 0 || scope.twoWayLets.has(d.name),
      flowIndex: flow.stmtIndex.get(d.statement) ?? -1,
      proven: kind === 'signal' || (kind === 'memo' && reads.size > 0),
      reads,
    })
  }

  for (const f of flow.flow) if (f.kind === 'await') f.reads = readsIn(f.node.argument, isReactive)

  const rootReadsIn = (node: t.Node): Set<string> => {
    const out = readsIn(node, () => true)
    for (const b of fnBindings) {
      if (b.referencePaths.some((r) => within(r.node, node))) out.add(b.identifier.name)
    }
    return out
  }

  return {
    bindings,
    liveReads,
    ctx,
    reactiveReadsIn: (node, opts) => readsIn(node, isReactive, opts?.skipFunctions),
    rootReadsIn,
  }
}
