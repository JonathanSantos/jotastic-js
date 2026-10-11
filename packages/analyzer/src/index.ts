/**
 * `@jotastic/analyzer`: função pura AST → análise (contrato em docs/spec/contracts/analyzer.d.ts).
 * Puramente sintático e de escopo: nenhuma informação de tipos do TypeScript.
 */
import type * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { Analysis, AnalyzeOptions, ReactiveBody } from './types'
import { findBodies, returnsJSX } from './bodies'
import { computeFlow } from './flow'
import { collectScope } from './scope'
import { classifyBody } from './classify'
import { collectDiagnostics, type BodyData } from './diagnostics'
import { traverse } from './util'

export type * from './types'
export { eventName, attributeKind, normalizeAttribute, isProbablyPrimitive, isAssignable } from './jsx'
export { DIAGNOSTIC_LEVELS, formatDiagnostic, type DiagnosticId } from './diagnostics'

export function analyze(ast: t.File, options: AnalyzeOptions): Analysis {
  let program: NodePath<t.Program> | undefined
  traverse(ast, {
    Program(p) {
      program = p
      p.stop()
    },
  })
  if (!program) return { bodies: [], diagnostics: [], topLevelJSX: [] }

  const found = findBodies(program, options)
  const data: BodyData[] = []
  for (const f of found.bodies) {
    const flow = computeFlow(f.path.node, f.kind)
    const scope = collectScope(f.path, f.kind)
    const cls = classifyBody(scope, flow)
    const body: ReactiveBody = {
      kind: f.kind,
      name: f.name,
      node: f.path.node,
      params: scope.params,
      bindings: cls.bindings,
      flow: flow.flow,
      liveReads: cls.liveReads,
      returnsJSX: returnsJSX(f.path.node),
      isAsync: !!f.path.node.async,
    }
    data.push({ body, scope, flow, cls })
  }
  return {
    bodies: data.map((d) => d.body),
    diagnostics: collectDiagnostics(program, options, data),
    topLevelJSX: found.topLevelJSX,
  }
}
