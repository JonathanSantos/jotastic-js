/** Early return / `await` no escopo raiz → `FlowNode[]` (18 §9 e §10). */
import * as t from '@babel/types'
import type { FlowNode } from './types'
import { findAwaits, walk } from './util'

export type FlowProblemId = 'return-in-loop-or-try' | 'await-in-try' | 'await-in-branch'

export interface FlowProblem {
  id: FlowProblemId
  node: t.Node
  /** `for`, `while`, `try`… (para a mensagem). */
  where: string
}

export interface FlowResult {
  flow: FlowNode[]
  /** Statement do escopo raiz → índice do FlowNode cuja continuação o contém (-1 = setup). */
  stmtIndex: Map<t.Node, number>
  /** Expressões avaliadas em contexto vivo pelo fluxo: condições de early return e discriminantes de `switch`. */
  liveExpressions: Set<t.Node>
  /** `if`/`switch` do escopo raiz que são pontos de decisão. */
  decisionStatements: Set<t.Node>
  problems: FlowProblem[]
}

const LOOP_NAMES: Partial<Record<t.Node['type'], string>> = {
  ForStatement: 'for',
  ForInStatement: 'for…in',
  ForOfStatement: 'for…of',
  WhileStatement: 'while',
  DoWhileStatement: 'do…while',
  TryStatement: 'try',
}

/** `return` direto do statement (ele mesmo, ou filho direto do bloco) e o que vem antes dele. */
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

function returnsInside(node: t.Node): t.ReturnStatement[] {
  const out: t.ReturnStatement[] = []
  walk(node, (n) => {
    if (t.isReturnStatement(n)) out.push(n)
  })
  return out
}

function withLoc<T extends t.Node>(node: T, from: t.Node): T {
  node.loc = from.loc
  node.start = from.start
  node.end = from.end
  return node
}

/**
 * Calcula o fluxo de um corpo. Componentes têm fluxo reativo completo; em `use*` só o `return` final é registrado
 * (`return` dentro de `if` é JS normal, 18 §11).
 */
export function computeFlow(fn: t.Function, kind: 'component' | 'use'): FlowResult {
  const res: FlowResult = {
    flow: [],
    stmtIndex: new Map(),
    liveExpressions: new Set(),
    decisionStatements: new Set(),
    problems: [],
  }
  if (!t.isBlockStatement(fn.body)) return res
  const stmts = fn.body.body
  let current = -1
  let ended = false

  if (kind === 'use') {
    for (const s of stmts) {
      res.stmtIndex.set(s, current)
      if (t.isReturnStatement(s)) {
        res.flow.push({ kind: 'final', node: s })
        break
      }
    }
    return res
  }

  const flagAwaits = (node: t.Node, id: FlowProblemId, where: string) => {
    for (const a of findAwaits(node)) res.problems.push({ id, node: a, where })
  }

  for (const s of stmts) {
    res.stmtIndex.set(s, current)

    if (t.isIfStatement(s)) {
      if (!directReturn(s.consequent)) {
        flagAwaits(s, 'await-in-branch', 'if')
        continue
      }
      res.decisionStatements.add(s)
      let cur: t.IfStatement | null = s
      let branchIndex = 0
      while (cur) {
        const found = directReturn(cur.consequent)
        if (!found) {
          // `else if` sem return no meio de uma cadeia: o resto é JS normal
          flagAwaits(cur, 'await-in-branch', 'if')
          break
        }
        flagAwaits(cur.consequent, 'await-in-branch', 'if')
        res.liveExpressions.add(cur.test)
        res.flow.push({
          kind: 'return',
          node: found.ret,
          cond: cur.test,
          branchIndex: branchIndex++,
          prelude: found.prelude,
        })
        const alt: t.Statement | null | undefined = cur.alternate
        if (!alt) break
        if (t.isIfStatement(alt)) {
          cur = alt
          continue
        }
        const fallback = directReturn(alt)
        if (fallback) {
          res.flow.push({ kind: 'final', node: fallback.ret })
          ended = true
        }
        flagAwaits(alt, 'await-in-branch', 'if')
        break
      }
      current = res.flow.length - 1
      if (ended) break
      continue
    }

    if (t.isSwitchStatement(s)) {
      const withBody = s.cases.filter((c) => c.consequent.length > 0)
      const isDecision = withBody.length > 0 && withBody.every((c) => caseReturn(c))
      if (!isDecision) {
        flagAwaits(s, 'await-in-branch', 'switch')
        continue
      }
      res.decisionStatements.add(s)
      res.liveExpressions.add(s.discriminant)
      flagAwaits(s, 'await-in-branch', 'switch')
      let pending: t.Expression[] = []
      let branchIndex = 0
      let fallback: t.ReturnStatement | null = null
      for (const c of s.cases) {
        if (!c.test) {
          const found = caseReturn(c)
          if (found) fallback = found.ret
          pending = []
          continue
        }
        res.liveExpressions.add(c.test)
        pending.push(c.test)
        const found = caseReturn(c)
        if (!found) continue
        const tests = pending.map((test) => withLoc(t.binaryExpression('===', s.discriminant, test), test))
        const cond = tests
          .slice(1)
          .reduce<t.Expression>((acc, e) => withLoc(t.logicalExpression('||', acc, e), e), tests[0])
        res.flow.push({ kind: 'return', node: found.ret, cond, branchIndex: branchIndex++, prelude: found.prelude })
        pending = []
      }
      current = res.flow.length - 1
      if (fallback) {
        res.flow.push({ kind: 'final', node: fallback })
        break
      }
      continue
    }

    const loop = LOOP_NAMES[s.type]
    if (loop) {
      for (const r of returnsInside(s)) res.problems.push({ id: 'return-in-loop-or-try', node: r, where: loop })
      if (t.isTryStatement(s)) flagAwaits(s, 'await-in-try', 'try')
      continue
    }

    if (t.isReturnStatement(s)) {
      res.flow.push({ kind: 'final', node: s })
      break
    }

    if (t.isVariableDeclaration(s)) {
      for (const d of s.declarations) {
        if (!d.init) continue
        for (const a of findAwaits(d.init)) res.flow.push({ kind: 'await', node: a, declarator: d, reads: new Set() })
      }
      current = res.flow.length - 1
      continue
    }

    if (t.isExpressionStatement(s)) {
      for (const a of findAwaits(s.expression)) res.flow.push({ kind: 'await', node: a, reads: new Set() })
      current = res.flow.length - 1
      continue
    }

    if (t.isBlockStatement(s) || t.isLabeledStatement(s)) flagAwaits(s, 'await-in-branch', 'bloco')
  }
  return res
}
