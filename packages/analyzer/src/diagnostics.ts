/** Catálogo e detecção dos diagnósticos estáticos de 12-diagnosticos.md (§Compilação / editor). */
import * as t from '@babel/types'
import type { Binding, NodePath } from '@babel/traverse'
import type { AnalyzeOptions, Diagnostic, DiagnosticLevel, ReactiveBody } from './types'
import type { FlowResult } from './flow'
import type { BodyScope } from './scope'
import type { Classification } from './classify'
import { isListExpression } from './classify'
import { isMutated } from './scope'
import { isAssignable, isProbablyPrimitive, twoWayCandidates } from './jsx'
import {
  attrName,
  containsNode,
  findAttr,
  importedName,
  isIntrinsic,
  isUseName,
  jotasticCallee,
  jsxName,
  memberRoot,
  toLoc,
  unwrap,
  walk,
  within,
} from './util'

export const DIAGNOSTIC_LEVELS = {
  'return-in-loop-or-try': 'error',
  'await-in-try': 'error',
  'use-return-not-object': 'error',
  'ref-before-mount': 'error',
  'slot-not-direct-child': 'error',
  'inner-html-object': 'error',
  'await-in-branch': 'error',
  'list-const-used-twice': 'error',
  'slot-name-not-literal': 'error',
  'component-ref-unsupported': 'error',
  'use-spread-args-unsupported': 'error',
  'use-param-assignment': 'error',
  'await-position-unsupported': 'error',
  'await-in-use-unsupported': 'error',
  'pending-not-resource': 'error',
  'slot-mixed-branch': 'hint',
  'continuation-state-resets': 'warning',
  'state-read-in-setup': 'warning',
  'watch-without-reads': 'warning',
  'prefer-key-in-list': 'warning',
  'class-name-alias': 'warning',
  'ref-non-optional-in-branch': 'warning',
  'on-change-on-input': 'hint',
  'value-not-writable': 'hint',
  'fetch-without-signal': 'hint',
  'await-waterfall': 'hint',
  'let-never-reassigned': 'hint',
} as const satisfies Record<string, DiagnosticLevel>

export type DiagnosticId = keyof typeof DIAGNOSTIC_LEVELS

export function diagnostic(
  id: DiagnosticId,
  node: t.Node,
  message: string,
  suggestion?: string,
  fix?: Diagnostic['fix'],
): Diagnostic {
  const d: Diagnostic = { id, level: DIAGNOSTIC_LEVELS[id], message, loc: toLoc(node) }
  if (suggestion) d.suggestion = suggestion
  if (fix) d.fix = fix
  return d
}

/** Formato de 12 §Formato (para CLI / logs). */
export function formatDiagnostic(d: Diagnostic, filename: string): string {
  const icon = d.level === 'error' ? '✖' : d.level === 'warning' ? '⚠' : 'ℹ'
  let out = `${icon} ${filename}:${d.loc.line}:${d.loc.column}  jotastic/${d.id}\n  ${d.message}`
  if (d.suggestion) out += `\n  Sugestão: ${d.suggestion}`
  return out
}

export interface BodyData {
  body: ReactiveBody
  scope: BodyScope
  flow: FlowResult
  cls: Classification
}

const src = (options: AnalyzeOptions, n: t.Node): string | null =>
  options.code != null && n.start != null && n.end != null ? options.code.slice(n.start, n.end) : null

// ── por corpo ─────────────────────────────────────────────────────────────────

function flowDiagnostics(data: BodyData, out: Diagnostic[]): void {
  for (const p of data.flow.problems) {
    if (p.id === 'return-in-loop-or-try')
      out.push(
        diagnostic(
          p.id,
          p.node,
          `Este \`return\` está dentro de um \`${p.where}\`; componentes executam uma vez e o compilador não consegue transformá-lo em branch.`,
          p.where === 'try'
            ? 'use `<Boundary error>` para erros e retorne o JSX fora do `try`.'
            : 'mova a condição para o JSX (ex.: `return items.length ? <List items={items} /> : <Empty />`).',
        ),
      )
    else if (p.id === 'await-in-try')
      out.push(
        diagnostic(
          p.id,
          p.node,
          '`await` dentro de `try` no corpo do componente não é suportado no MVP: o erro do recurso é roteado ao `<Boundary>` mais próximo.',
          'remova o `try` e envolva o componente em `<Boundary error={(e, retry) => …}>`.',
        ),
      )
    else if (p.id === 'await-position-unsupported')
      out.push(
        diagnostic(
          p.id,
          p.node,
          t.isForOfStatement(p.node)
            ? '`for await` no corpo do componente não é suportado: só `await` no escopo raiz vira recurso.'
            : 'Este `await` está numa posição que o compilador não transforma em recurso: só `const x = await …`, `await …;` e `const x = f(await …)` (um `await` por declaração, avaliado sempre) são suportados.',
          'declare `const x = await …` numa linha própria e use `x` depois.',
        ),
      )
    else if (p.id === 'await-in-use-unsupported')
      out.push(
        diagnostic(
          p.id,
          p.node,
          `\`await\` no corpo de \`${data.body.name}\` não é suportado no MVP: funções \`use*\` não viram recurso.`,
          'dispare a promise dentro de `watch(() => { f().then(v => (x = v)) })` e guarde o resultado num `let`.',
        ),
      )
    else
      out.push(
        diagnostic(
          p.id,
          p.node,
          `\`await\` dentro de \`${p.where}\` no corpo do componente não vira recurso (só \`await\` no escopo raiz é suportado no MVP).`,
          'mova o `await` para o topo do componente ou para dentro de um handler.',
        ),
      )
  }
}

function useReturn(data: BodyData, out: Diagnostic[]): void {
  const fn = data.scope.fn.node
  if (!t.isBlockStatement(fn.body)) return
  walk(fn.body, (n) => {
    if (!t.isReturnStatement(n) || !n.argument) return
    const arg = unwrap(n.argument)
    if (t.isObjectExpression(arg) || t.isFunction(arg) || t.isNullLiteral(arg)) return
    if (t.isIdentifier(arg) && arg.name === 'undefined') return
    if (t.isUnaryExpression(arg, { operator: 'void' })) return
    let bad = false
    let name = ''
    if (t.isIdentifier(arg)) {
      name = arg.name
      const b = data.body.bindings.get(arg.name)
      if (b) bad = b.isLet || b.kind === 'memo' || b.kind === 'resource' || b.kind === 'list' || b.kind === 'jsx'
      else bad = data.body.params.some((p) => p.name === arg.name)
    } else bad = isProbablyPrimitive(arg)
    if (!bad) return
    const example = name ? `return { ${name} }` : 'return { value: … }'
    out.push(
      diagnostic(
        'use-return-not-object',
        n.argument,
        `A função \`${data.body.name}\` retorna ${name ? `\`${name}\` solto` : 'uma expressão que não é objeto'}; o valor seria copiado uma vez e perderia a reatividade.`,
        `retorne um objeto literal: \`${example}\` (o compilador gera getters/setters por chave).`,
      ),
    )
  })
}

function refBeforeMount(data: BodyData, out: Diagnostic[]): void {
  const fn = data.scope.fn.node
  for (const d of data.scope.decls) {
    const kind = data.body.bindings.get(d.name)!.kind
    if (kind !== 'ref' && kind !== 'external') continue
    for (const r of d.binding.referencePaths) {
      let p: NodePath | null = r.parentPath
      let ok = false
      let child: NodePath = r
      while (p && p.node !== fn) {
        if (p.isFunction() || p.isJSXElement() || p.isJSXFragment()) {
          ok = true
          break
        }
        if (p.isCallExpression() && child.listKey === 'arguments') {
          const c = p.node.callee
          if (t.isIdentifier(c) && isUseName(c.name)) {
            ok = true
            break
          }
        }
        child = p
        p = p.parentPath
      }
      if (ok) continue
      out.push(
        diagnostic(
          'ref-before-mount',
          r.node,
          `\`${d.name}\` ${kind === 'ref' ? 'é um `ref`' : 'vem de `external`'} e ainda não existe durante o setup do componente (o elemento é atribuído quando o template é criado).`,
          'leia dentro de `onMount(() => …)`, de um `external(…)` ou de um handler.',
        ),
      )
    }
  }
}

function listConstUsedTwice(data: BodyData, out: Diagnostic[]): void {
  for (const d of data.scope.decls) {
    if (data.body.bindings.get(d.name)!.kind !== 'list') continue
    const refs = d.binding.referencePaths
    if (refs.length < 2) continue
    out.push(
      diagnostic(
        'list-const-used-twice',
        refs[1].node,
        `\`${d.name}\` é uma lista (\`.map\` com JSX) e já foi inserida em outro lugar; os mesmos nós não podem estar em dois pontos do DOM.`,
        'extraia um componente e renderize-o nos dois lugares.',
      ),
    )
  }
}

function continuationResets(data: BodyData, out: Diagnostic[]): void {
  for (const d of data.scope.decls) {
    const b = data.body.bindings.get(d.name)!
    if (!d.isLet || b.flowIndex < 0) continue
    const f = data.flow.flow[b.flowIndex]
    out.push(
      diagnostic(
        'continuation-state-resets',
        d.binding.identifier,
        `\`${d.name}\` foi declarado depois de ${f?.kind === 'await' ? 'um `await`' : 'um early return'}; ele pertence à continuação e volta ao valor inicial sempre que ela é recriada.`,
        'para manter o valor, declare o `let` antes do primeiro `return`/`await`.',
      ),
    )
  }
}

/** Leitura solta (`count;`, `a.b;`, `a + b;`): sem chamada, atribuição, `new`, `await` nem `delete` (fora de funções). */
function isBareRead(e: t.Node): boolean {
  return !containsNode(
    e,
    (n) =>
      t.isCallExpression(n) ||
      t.isOptionalCallExpression(n) ||
      t.isNewExpression(n) ||
      t.isTaggedTemplateExpression(n) ||
      t.isAssignmentExpression(n) ||
      t.isUpdateExpression(n) ||
      t.isAwaitExpression(n) ||
      t.isYieldExpression(n) ||
      t.isUnaryExpression(n, { operator: 'delete' }) ||
      t.isFunction(n) ||
      t.isJSXElement(n) ||
      t.isJSXFragment(n),
  )
}

/** `console.*(…)` com o `console` global. */
function isConsoleCall(s: NodePath, e: t.Node): boolean {
  if (!t.isCallExpression(e)) return false
  const callee = unwrap(e.callee)
  return (
    t.isMemberExpression(callee) && t.isIdentifier(callee.object, { name: 'console' }) && !s.scope.getBinding('console')
  )
}

/** A-10: só leitura solta e `console.*(…)`; chamadas de método/função (`tabs.register(id)`) não avisam. */
function stateReadInSetup(data: BodyData, options: AnalyzeOptions, out: Diagnostic[]): void {
  const body = data.scope.fn.get('body')
  if (!body.isBlockStatement()) return
  for (const s of body.get('body')) {
    if (!s.isExpressionStatement()) continue
    const e = unwrap(s.node.expression)
    if (!isBareRead(e) && !isConsoleCall(s, e)) continue
    const reads = data.cls.reactiveReadsIn(s.node.expression, { skipFunctions: true })
    if (reads.size === 0) continue
    const names = [...reads].map((n) => `\`${n}\``).join(', ')
    const code = src(options, s.node.expression)
    out.push(
      diagnostic(
        'state-read-in-setup',
        s.node,
        `Esta instrução lê ${names} no setup: o corpo do componente roda uma vez, então ela não roda de novo quando o valor muda.`,
        'envolva em `watch(() => …)` para reagir às mudanças.',
        code != null
          ? { range: [s.node.expression.start!, s.node.expression.end!], text: `watch(() => ${code})` }
          : undefined,
      ),
    )
  }
}

function watchWithoutReads(data: BodyData, out: Diagnostic[]): void {
  data.scope.fn.traverse({
    CallExpression(call) {
      if (jotasticCallee(call) !== 'watch') return
      const cb = call.get('arguments')[0]
      if (!cb || !cb.isFunction()) return
      let reads = false
      cb.traverse({
        Function(p) {
          p.skip()
        },
        ThisExpression() {
          reads = true
        },
        ReferencedIdentifier(p) {
          const name = (p.node as t.Identifier).name
          const b = p.scope.getBinding(name)
          if (b && !within(b.identifier, cb.node)) reads = true
        },
      })
      if (reads) return
      out.push(
        diagnostic(
          'watch-without-reads',
          call.node,
          'Este `watch` não lê nada reativo: ele roda uma vez e nunca mais.',
          'use `onMount(() => …)` para código que roda uma vez depois de montar.',
        ),
      )
    },
  })
}

type ItemShape = 'primitive' | 'noId' | 'unknown'

function elementShape(e: t.Node): ItemShape {
  const n = unwrap(e)
  if (isProbablyPrimitive(n)) return 'primitive'
  if (t.isObjectExpression(n)) {
    const hasId = n.properties.some(
      (p) =>
        t.isSpreadElement(p) ||
        ((t.isObjectProperty(p) || t.isObjectMethod(p)) &&
          (t.isIdentifier(p.key, { name: 'id' }) || t.isStringLiteral(p.key, { value: 'id' }))),
    )
    return hasId ? 'unknown' : 'noId'
  }
  return 'unknown'
}

/** Tipo do elemento em `T[]` / `Array<T>` / `readonly T[]`. */
function typeShape(type: t.Node | null | undefined): ItemShape | null {
  if (!type) return null
  let el: t.Node | null | undefined = null
  if (t.isTSArrayType(type)) el = type.elementType
  else if (t.isTSTypeOperator(type)) return typeShape(type.typeAnnotation)
  else if (
    t.isTSTypeReference(type) &&
    t.isIdentifier(type.typeName) &&
    (type.typeName.name === 'Array' || type.typeName.name === 'ReadonlyArray')
  )
    el = type.typeParameters?.params[0]
  if (!el) return 'unknown'
  const prim = (x: t.Node): boolean =>
    t.isTSStringKeyword(x) ||
    t.isTSNumberKeyword(x) ||
    t.isTSBooleanKeyword(x) ||
    t.isTSBigIntKeyword(x) ||
    t.isTSLiteralType(x) ||
    (t.isTSUnionType(x) && x.types.every(prim))
  if (prim(el)) return 'primitive'
  if (t.isTSTypeLiteral(el))
    return el.members.some((m) => t.isTSPropertySignature(m) && t.isIdentifier(m.key, { name: 'id' }))
      ? 'unknown'
      : 'noId'
  return 'unknown'
}

/**
 * X-12: os itens de um `let` de array são primitivos ou literais de objeto sem `id`? Evidência: tipo anotado,
 * elementos de literais de array no inicializador e nas atribuições, argumentos de `push`/`unshift`. Qualquer
 * elemento de shape desconhecido (ou nenhuma evidência) → `false`.
 */
function itemsLackId(binding: Binding, declarator: t.VariableDeclarator): boolean {
  const shapes: ItemShape[] = []
  const id = declarator.id
  const annotated =
    t.isIdentifier(id) && t.isTSTypeAnnotation(id.typeAnnotation) ? id.typeAnnotation.typeAnnotation : null
  const ts = typeShape(annotated)
  if (ts) shapes.push(ts)
  const fromArray = (e: t.Node | null | undefined) => {
    if (!e) return
    const n = unwrap(e)
    if (t.isArrayExpression(n)) {
      for (const el of n.elements) {
        if (!el) continue
        if (t.isSpreadElement(el)) {
          const arg = unwrap(el.argument)
          if (t.isIdentifier(arg) && arg.name === binding.identifier.name) continue
          shapes.push('unknown')
        } else shapes.push(elementShape(el))
      }
    } else if (t.isCallExpression(n) && t.isMemberExpression(n.callee)) {
      // `xs.filter(…)`/`xs.slice(…)` da própria fonte preservam o shape
      const root = memberRoot(n.callee)
      if (!(t.isIdentifier(root) && root.name === binding.identifier.name)) shapes.push('unknown')
    } else if (!(t.isIdentifier(n) && n.name === 'undefined')) shapes.push('unknown')
  }
  if (declarator.init) fromArray(declarator.init)
  for (const v of binding.constantViolations) {
    if (v.isAssignmentExpression() && v.node.operator === '=') fromArray(v.node.right)
    else if (!v.isVariableDeclarator()) shapes.push('unknown')
  }
  for (const r of binding.referencePaths) {
    const m = r.parentPath
    if (!m?.isMemberExpression() || m.node.object !== r.node || !t.isIdentifier(m.node.property)) continue
    if (!['push', 'unshift'].includes(m.node.property.name)) continue
    const call = m.parentPath
    if (!call?.isCallExpression() || call.node.callee !== m.node) continue
    for (const a of call.node.arguments) shapes.push(t.isSpreadElement(a) ? 'unknown' : elementShape(a))
  }
  return shapes.length > 0 && shapes.every((x) => x !== 'unknown')
}

function preferKey(data: BodyData, out: Diagnostic[]): void {
  data.scope.fn.traverse({
    CallExpression(call) {
      const node = call.node
      if (!isListExpression(node)) return
      // só listas inseridas (posição de filho no JSX ou `const` de lista)
      const parent = call.parentPath
      const inJSX = parent.isJSXExpressionContainer() && !parent.parentPath?.isJSXAttribute()
      const isConst = parent.isVariableDeclarator() && data.body.bindings.get((parent.node.id as t.Identifier).name)
      if (!inJSX && !isConst) return
      const cb = unwrap(node.arguments[0]) as t.Function
      // elemento raiz com key?
      let root: t.Node | null | undefined = t.isBlockStatement(cb.body)
        ? (cb.body.body.find((s) => t.isReturnStatement(s)) as t.ReturnStatement | undefined)?.argument
        : cb.body
      root = root && unwrap(root)
      if (root && t.isJSXElement(root) && findAttr(root.openingElement, 'key')) return
      // fonte reatribuível?
      const callee = unwrap(node.callee) as t.MemberExpression
      let srcExpr: t.Node = unwrap(callee.object)
      while (
        t.isCallExpression(srcExpr) &&
        t.isMemberExpression(srcExpr.callee) &&
        t.isIdentifier(srcExpr.callee.property) &&
        ['filter', 'slice', 'sort', 'toSorted', 'reverse', 'toReversed', 'flatMap'].includes(
          srcExpr.callee.property.name,
        )
      )
        srcExpr = unwrap(srcExpr.callee.object)
      const rootId = memberRoot(srcExpr)
      if (!t.isIdentifier(rootId)) return
      const binding = call.scope.getBinding(rootId.name)
      // X-12: só `let` reatribuído cujo item é primitivo ou literal de objeto sem `id`; await/store (shape
      // desconhecido) não avisam.
      const decl = data.scope.declByName.get(rootId.name)
      const info = data.body.bindings.get(rootId.name)
      if (!info || !decl || decl.binding !== binding || !info.isLet || !info.reassigned) return
      if (!itemsLackId(decl.binding, decl.declarator.node)) return
      const why = 'é um `let` reatribuído'
      // item com id evidente?
      const item = cb.params[0]
      if (t.isIdentifier(item)) {
        let hasId = false
        walk(
          cb.body,
          (n) => {
            if (
              (t.isMemberExpression(n) || t.isOptionalMemberExpression(n)) &&
              t.isIdentifier(n.object, { name: item.name }) &&
              t.isIdentifier(n.property, { name: 'id' })
            )
              hasId = true
          },
          { functions: true },
        )
        if (hasId) return
      }
      out.push(
        diagnostic(
          'prefer-key-in-list',
          node,
          `Esta lista não tem \`key\` e a fonte \`${rootId.name}\` ${why}; ao substituir o array, itens sem \`id\` são recriados.`,
          'adicione `key={item.id}` (ou outra chave estável) no elemento raiz do `.map`.',
        ),
      )
    },
  })
}

function refNonOptionalInBranch(data: BodyData, out: Diagnostic[]): void {
  const fn = data.scope.fn.node
  const decisionReturns = new Set<t.Node>()
  for (const f of data.flow.flow) if (f.kind === 'return') decisionReturns.add(f.node)
  data.scope.fn.traverse({
    JSXAttribute(attr) {
      if (attrName(attr.node) !== 'ref') return
      const v = attr.node.value
      if (!t.isJSXExpressionContainer(v) || !t.isIdentifier(v.expression)) return
      const name = v.expression.name
      const d = data.scope.declByName.get(name)
      if (!d || !d.isLet || !d.declarator.node.definite || attr.scope.getBinding(name) !== d.binding) return
      let conditional = false
      let child: NodePath = attr
      let p: NodePath | null = attr.parentPath
      while (p && p.node !== fn) {
        if (p.isConditionalExpression() && child.key !== 'test') conditional = true
        if (p.isLogicalExpression() && child.key === 'right') conditional = true
        if (p.isFunction() && p.parentPath?.isCallExpression() && isListExpression(p.parentPath.node))
          conditional = true
        if (p.isReturnStatement() && decisionReturns.has(p.node)) conditional = true
        if (p.parentPath?.node === fn.body && (data.flow.stmtIndex.get(p.node) ?? -1) >= 0) conditional = true
        child = p
        p = p.parentPath
      }
      if (!conditional) return
      out.push(
        diagnostic(
          'ref-non-optional-in-branch',
          attr.node,
          `\`${name}\` foi declarado com \`!:\`, mas o elemento é condicional: o ref vira \`undefined\` quando o branch desativa.`,
          `declare como \`let ${name}: T | undefined\` e trate o caso ausente.`,
        ),
      )
    },
  })
}

function fetchWithoutSignal(data: BodyData, out: Diagnostic[]): void {
  const check = (root: t.Node, scopePath: NodePath) => {
    walk(root, (n) => {
      if (!t.isCallExpression(n) || !t.isIdentifier(n.callee, { name: 'fetch' })) return
      if (scopePath.scope.getBinding('fetch')) return // importado (ex.: jotastic/fetch) ou local
      const init = n.arguments[1] && unwrap(n.arguments[1])
      if (init && !t.isObjectExpression(init)) return
      if (
        init &&
        init.properties.some(
          (p) =>
            t.isSpreadElement(p) ||
            ((t.isObjectProperty(p) || t.isObjectMethod(p)) && t.isIdentifier(p.key, { name: 'signal' })),
        )
      )
        return
      out.push(
        diagnostic(
          'fetch-without-signal',
          n,
          'Este `fetch` não recebe `signal`: quando a dependência muda, a resposta antiga é ignorada, mas a requisição continua na rede.',
          "use `import { fetch } from 'jotastic/fetch'` ou passe `{ signal: abortSignal() }`.",
        ),
      )
    })
  }
  if (data.body.kind === 'component') {
    for (const f of data.flow.flow) if (f.kind === 'await') check(f.node.argument, data.scope.fn)
  }
  data.scope.fn.traverse({
    CallExpression(call) {
      if (jotasticCallee(call) !== 'watch') return
      const cb = call.node.arguments[0]
      if (cb && t.isFunction(cb)) check(cb.body, call)
    },
  })
}

function awaitWaterfall(data: BodyData, out: Diagnostic[]): void {
  const flow = data.flow.flow
  for (let i = 1; i < flow.length; i++) {
    const prev = flow[i - 1]
    const cur = flow[i]
    if (prev.kind !== 'await' || cur.kind !== 'await') continue
    const deps = new Set<string>()
    if (prev.declarator) for (const n of Object.keys(t.getBindingIdentifiers(prev.declarator.id))) deps.add(n)
    // dependência transitiva por declarações entre os dois awaits
    for (const b of data.body.bindings.values()) {
      if (b.flowIndex !== i - 1 || b.declarator === prev.declarator || b.declarator === cur.declarator) continue
      const reads = data.cls.rootReadsIn(b.declarator.init ?? b.declarator)
      if ([...reads].some((r) => deps.has(r))) deps.add(b.name)
    }
    const reads = data.cls.rootReadsIn(cur.node.argument)
    if ([...reads].some((r) => deps.has(r))) continue
    out.push(
      diagnostic(
        'await-waterfall',
        cur.node,
        'Este `await` não depende do anterior, mas só começa depois que ele termina (cascata).',
        'rode em paralelo: `const [a, b] = await Promise.all([fa(), fb()])`.',
      ),
    )
  }
}

function letNeverReassigned(data: BodyData, out: Diagnostic[]): void {
  const seen = new Set<t.Node>()
  for (const d of data.scope.decls) {
    if (!d.isLet || seen.has(d.statement)) continue
    seen.add(d.statement)
    const decl = d.statement as t.VariableDeclaration
    const all = data.scope.decls.filter((x) => x.statement === decl)
    const ok =
      decl.declarations.every((x) => x.init) &&
      all.every((x) => {
        const b = data.body.bindings.get(x.name)!
        return !b.reassigned && b.kind !== 'ref' && !isMutated(x.binding) && !data.scope.twoWayMutated.has(x.name)
      })
    if (!ok) continue
    out.push(
      diagnostic(
        'let-never-reassigned',
        decl,
        `${all.map((x) => `\`${x.name}\``).join(', ')} nunca é reatribuído nem mutado; \`let\` cria estado sem necessidade.`,
        'use `const`.',
        { range: [decl.start!, decl.start! + 3], text: 'const' },
      ),
    )
  }
}

function useParamAssignment(data: BodyData, out: Diagnostic[]): void {
  for (const [b, name] of data.scope.paramBindings) {
    for (const v of b.constantViolations) {
      out.push(
        diagnostic(
          'use-param-assignment',
          v.node,
          `\`${name}\` é parâmetro de \`${data.body.name}\`: parâmetros de \`use*\` chegam como getters do chamador e não podem ser reatribuídos.`,
          `copie para um \`let\` local (\`let ${name}Local = ${name}\`) e escreva nele.`,
        ),
      )
    }
  }
}

// ── arquivo inteiro (chamadas) ────────────────────────────────────────────────

function callDiagnostics(program: NodePath<t.Program>, data: BodyData[], out: Diagnostic[]): void {
  const resources = new Set<Binding>()
  for (const d of data)
    for (const decl of d.scope.decls)
      if (d.body.bindings.get(decl.name)?.kind === 'resource') resources.add(decl.binding)
  const inBody = (n: t.Node) => data.some((d) => within(n, d.body.node))
  program.traverse({
    CallExpression(call) {
      const callee = call.node.callee
      if (!t.isIdentifier(callee)) return
      if (isUseName(callee.name) && inBody(call.node)) {
        const spread = call.node.arguments.find((a) => t.isSpreadElement(a))
        if (spread)
          out.push(
            diagnostic(
              'use-spread-args-unsupported',
              spread,
              `Spread nos argumentos de \`${callee.name}\` não é suportado: cada argumento de \`use*\` vira um getter separado em build.`,
              'passe os argumentos um a um, ou passe o array como um único argumento.',
            ),
          )
      }
      const api = jotasticCallee(call)
      if (api !== 'pending' && api !== 'refresh') return
      const arg = call.node.arguments[0]
      if (arg && t.isIdentifier(arg)) {
        const b = call.scope.getBinding(arg.name)
        if (b && resources.has(b)) return
      }
      out.push(
        diagnostic(
          'pending-not-resource',
          call.node,
          `\`${api}(…)\` só funciona com uma variável que vem de \`await\` no corpo do componente (\`const x = await …\`).`,
          `passe o nome declarado com \`await\`, ex.: \`const user = await api.user(id)\` → \`${api}(user)\`.`,
        ),
      )
    },
  })
}

// ── arquivo inteiro (JSX) ─────────────────────────────────────────────────────

function isSlotElement(p: NodePath<t.JSXElement>): boolean {
  const name = p.node.openingElement.name
  if (!t.isJSXIdentifier(name) || name.name !== 'Slot') return false
  const b = p.scope.getBinding('Slot')
  return !b || importedName(p, 'Slot') === 'Slot'
}

function jsxDiagnostics(program: NodePath<t.Program>, options: AnalyzeOptions, data: BodyData[], out: Diagnostic[]) {
  const propsObjects = new Set<unknown>()
  const propBindings = new Set<unknown>()
  for (const d of data) {
    if (d.body.kind !== 'component') continue
    for (const [b] of d.scope.paramBindings) {
      propBindings.add(b)
      if (d.body.params.some((p) => p.kind === 'propsObject')) propsObjects.add(b)
    }
  }
  const stateLiteralBindings = new Set<unknown>()
  for (const d of data)
    for (const decl of d.scope.decls)
      if (d.body.bindings.get(decl.name)?.kind === 'stateLiteral') stateLiteralBindings.add(decl.binding)

  program.traverse({
    JSXElement(el) {
      if (!isSlotElement(el)) return
      const nameAttr = findAttr(el.node.openingElement, 'name')
      if (nameAttr) {
        const v = nameAttr.value
        const literal = t.isStringLiteral(v) || (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression))
        if (!literal)
          out.push(
            diagnostic(
              'slot-name-not-literal',
              nameAttr,
              '`<Slot name>` precisa de uma string literal: os slots são separados em tempo de build.',
              'use `name="nome"`; para escolher em runtime, use um ternário entre dois `<Slot>`.',
            ),
          )
      }
      // sobe por fragmentos, `{…}`, `&&` e ternários até o elemento pai
      let child: NodePath = el
      let p: NodePath | null = el.parentPath
      const mixed: t.ConditionalExpression[] = []
      while (
        p &&
        (p.isJSXFragment() ||
          p.isJSXExpressionContainer() ||
          p.isParenthesizedExpression() ||
          (p.isLogicalExpression() && child.key === 'right') ||
          (p.isConditionalExpression() && child.key !== 'test'))
      ) {
        if (p.isJSXExpressionContainer() && p.parentPath?.isJSXAttribute()) break
        if (p.isConditionalExpression()) {
          const other = unwrap(child.key === 'consequent' ? p.node.alternate : p.node.consequent)
          const nullish =
            t.isNullLiteral(other) ||
            t.isBooleanLiteral(other, { value: false }) ||
            t.isIdentifier(other, { name: 'undefined' })
          const otherIsSlot =
            t.isJSXElement(other) &&
            isSlotElement(p.get(child.key === 'consequent' ? 'alternate' : 'consequent') as NodePath<t.JSXElement>)
          if (!nullish && !otherIsSlot) mixed.push(p.node)
        }
        child = p
        p = p.parentPath
      }
      const ok =
        !!p &&
        p.isJSXElement() &&
        child.listKey === 'children' &&
        !isIntrinsic(p.node.openingElement.name) &&
        !isSlotElement(p as NodePath<t.JSXElement>)
      if (ok)
        for (const c of mixed)
          out.push(
            diagnostic(
              'slot-mixed-branch',
              c,
              'Ternário entre um `<Slot>` e conteúdo comum: o slot e o `default` viram getters complementares (um é `null` quando o outro está ativo).',
              'se a intenção é trocar só o conteúdo do slot, coloque o ternário dentro do `<Slot>`.',
            ),
          )
      if (!ok)
        out.push(
          diagnostic(
            'slot-not-direct-child',
            el.node.openingElement,
            '`<Slot>` só funciona como filho direto de um componente (atravessando fragmentos, `&&` e ternários); aqui ele não pode ser separado em build.',
            'mova o `<Slot>` para o nível dos children do componente.',
          ),
        )
    },
    JSXOpeningElement(open) {
      const node = open.node
      const intrinsic = isIntrinsic(node.name)
      const tag = jsxName(node.name)
      for (const a of node.attributes) {
        if (!t.isJSXAttribute(a)) continue
        const name = attrName(a)
        if (name === 'ref' && !intrinsic)
          out.push(
            diagnostic(
              'component-ref-unsupported',
              a,
              `\`ref\` em componente (\`<${tag}>\`) ainda não é suportado (fase 2).`,
              'passe uma prop de callback, ex.: `inputRef={el => (input = el)}`.',
            ),
          )
        if (!intrinsic) continue
        if (name === 'dangerouslySetInnerHTML') {
          let fix: Diagnostic['fix']
          const v = a.value
          if (t.isJSXExpressionContainer(v) && t.isObjectExpression(v.expression)) {
            const prop = v.expression.properties.find(
              (p): p is t.ObjectProperty =>
                t.isObjectProperty(p) &&
                (t.isIdentifier(p.key, { name: '__html' }) || t.isStringLiteral(p.key, { value: '__html' })),
            )
            const code = prop && src(options, prop.value)
            if (code != null && v.expression.properties.length === 1)
              fix = { range: [a.start!, a.end!], text: `innerHTML={${code}}` }
          }
          out.push(
            diagnostic(
              'inner-html-object',
              a,
              '`dangerouslySetInnerHTML={{ __html }}` não existe no Jotastic: o HTML é aplicado pela propriedade `innerHTML`.',
              'use `innerHTML={html}`.',
              fix,
            ),
          )
        }
        if (name === 'className' || name === 'htmlFor') {
          const to = name === 'className' ? 'class' : 'for'
          out.push(
            diagnostic(
              'class-name-alias',
              a.name,
              `\`${name}\` é o nome do React; no Jotastic os atributos são os do HTML.`,
              `use \`${to}\`.`,
              { range: [a.name.start!, a.name.end!], text: to },
            ),
          )
        }
      }
      if (!intrinsic || !['input', 'textarea', 'select'].includes(tag)) return
      const typeAttr = findAttr(node, 'type')
      const type = typeAttr && t.isStringLiteral(typeAttr.value) ? typeAttr.value.value : undefined
      const onChange = findAttr(node, 'onChange')
      if (
        tag !== 'select' &&
        onChange &&
        findAttr(node, 'value') &&
        type !== 'checkbox' &&
        type !== 'radio' &&
        type !== 'file'
      )
        out.push(
          diagnostic(
            'on-change-on-input',
            onChange,
            '`onChange` é o evento nativo: em campos de texto ele só dispara ao perder o foco, não a cada tecla.',
            'use `onInput` (ou remova o handler: `value={x}` já é two-way).',
          ),
        )
      if (node.attributes.some((a) => t.isJSXSpreadAttribute(a))) return
      for (const c of twoWayCandidates(node)) {
        const e = unwrap(c.expr)
        let writable = isAssignable(e)
        if (writable) {
          const root = memberRoot(e)
          if (t.isIdentifier(root)) {
            const b = open.scope.getBinding(root.name)
            if (
              e === root &&
              b &&
              (propBindings.has(b) || b.kind === 'module' || (b.kind === 'const' && !stateLiteralBindings.has(b)))
            )
              writable = false
            if (e !== root && b && propsObjects.has(b) && t.isMemberExpression(e) && e.object === root) writable = false
          }
        }
        if (writable) continue
        const name = attrName(c.attr)
        out.push(
          diagnostic(
            'value-not-writable',
            c.attr,
            `\`${name}\` recebe uma expressão que não pode ser escrita (prop, chamada ou derivado) e não há handler: o campo não atualiza o estado.`,
            'copie para um `let` (`let draft = value`) ou adicione `onInput`.',
          ),
        )
      }
    },
  })
}

export function collectDiagnostics(
  program: NodePath<t.Program>,
  options: AnalyzeOptions,
  data: BodyData[],
): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const d of data) {
    flowDiagnostics(d, out)
    if (d.body.kind === 'component') {
      continuationResets(d, out)
      stateReadInSetup(d, options, out)
      refNonOptionalInBranch(d, out)
      awaitWaterfall(d, out)
    } else {
      useReturn(d, out)
      useParamAssignment(d, out)
    }
    refBeforeMount(d, out)
    listConstUsedTwice(d, out)
    watchWithoutReads(d, out)
    preferKey(d, out)
    fetchWithoutSignal(d, out)
    letNeverReassigned(d, out)
  }
  jsxDiagnostics(program, options, data, out)
  callDiagnostics(program, data, out)
  out.sort((a, b) => a.loc.line - b.loc.line || a.loc.column - b.loc.column || a.id.localeCompare(b.id))
  return out
}
