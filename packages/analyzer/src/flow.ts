/** Early return / `await` no escopo raiz → `FlowNode[]` (18 §9 e §10). */
import * as t from '@babel/types'
import type { FlowNode } from './types'
import { findAwaits, unwrap, walk } from './util'

export type FlowProblemId =
  | 'return-in-loop-or-try'
  | 'await-in-try'
  | 'await-in-branch'
  | 'await-position-unsupported'
  | 'await-in-use-unsupported'

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

/** `target` só é avaliado sob condição dentro de `root` (ramo de `?:`, lado direito de `&&`/`||`/`??`, após `?.`). */
function conditionallyEvaluated(root: t.Node, target: t.Node): boolean {
  let found = false
  const visit = (n: t.Node, cond: boolean): void => {
    if (found) return
    if (n === target) {
      found = cond
      return
    }
    if (t.isFunction(n)) return
    for (const key of t.VISITOR_KEYS[n.type] ?? []) {
      const child = (n as unknown as Record<string, unknown>)[key]
      const c =
        cond ||
        (t.isConditionalExpression(n) && key !== 'test') ||
        (t.isLogicalExpression(n) && key === 'right') ||
        ((t.isOptionalCallExpression(n) || t.isOptionalMemberExpression(n)) && key !== 'object' && key !== 'callee')
      if (Array.isArray(child)) {
        for (const x of child) if (x && typeof x === 'object' && 'type' in x) visit(x as t.Node, c)
      } else if (child && typeof child === 'object' && 'type' in child) visit(child as t.Node, c)
    }
  }
  visit(root, false)
  return found
}

/**
 * W-5 (18 §10): `await` suportado em declaração. Um único declarador com um único `await`, que é o inicializador
 * inteiro (`const x = await e`, `let x = await e`, `const [a, b] = await e`) ou está aninhado em
 * `const x = f(await e)` / `(await e).y` (hoisting; só `const` com identificador, avaliado incondicionalmente).
 */
function supportedDeclAwait(
  s: t.VariableDeclaration,
  d: t.VariableDeclarator,
  awaits: t.AwaitExpression[],
): 'direct' | 'hoisted' | null {
  if (s.declarations.length !== 1 || awaits.length !== 1 || !d.init) return null
  if (unwrap(d.init) === awaits[0]) return 'direct'
  if (s.kind !== 'const' || !t.isIdentifier(d.id) || conditionallyEvaluated(d.init, awaits[0]!)) return null
  return 'hoisted'
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

  const forAwaits = (node: t.Node): t.Node[] => {
    const out: t.Node[] = []
    walk(node, (n) => {
      if (t.isForOfStatement(n) && n.await) out.push(n)
    })
    return out
  }

  if (kind === 'use') {
    // 18 §10 / W-5: `await` no corpo raiz de `use*` não é suportado no MVP
    for (const a of [...findAwaits(fn.body), ...forAwaits(fn.body)])
      res.problems.push({ id: 'await-in-use-unsupported', node: a, where: 'use*' })
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
        const awaits = findAwaits(d.init)
        if (awaits.length === 0) continue
        const form = supportedDeclAwait(s, d, awaits)
        if (form)
          res.flow.push({
            kind: 'await',
            node: awaits[0]!,
            declarator: d,
            reads: new Set(),
            hoisted: form === 'hoisted',
          })
        else
          for (const a of awaits) res.problems.push({ id: 'await-position-unsupported', node: a, where: 'declaração' })
      }
      current = res.flow.length - 1
      continue
    }

    if (t.isExpressionStatement(s)) {
      const awaits = findAwaits(s.expression)
      if (awaits.length === 1 && unwrap(s.expression) === awaits[0])
        res.flow.push({ kind: 'await', node: awaits[0], reads: new Set(), hoisted: false })
      else for (const a of awaits) res.problems.push({ id: 'await-position-unsupported', node: a, where: 'expressão' })
      current = res.flow.length - 1
      continue
    }

    if (t.isBlockStatement(s) || t.isLabeledStatement(s)) flagAwaits(s, 'await-in-branch', 'bloco')
  }

  // `await` (e `for await`) em qualquer outra posição do escopo raiz (`return`, condição de `if`, laço…)
  const covered = new Set<t.Node>(res.problems.map((p) => p.node))
  for (const f of res.flow) if (f.kind === 'await') covered.add(f.node)
  for (const a of [...findAwaits(fn.body), ...forAwaits(fn.body)])
    if (!covered.has(a)) res.problems.push({ id: 'await-position-unsupported', node: a, where: 'posição' })
  return res
}
