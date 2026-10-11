/** Catálogo e detecção dos diagnósticos estáticos de 12-diagnosticos.md (§Compilação / editor). */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import type { AnalyzeOptions, Diagnostic, DiagnosticLevel, ReactiveBody } from './types'
import type { FlowResult } from './flow'
import type { BodyScope } from './scope'
import type { Classification } from './classify'
import { isListExpression } from './classify'
import { isMutated } from './scope'
import { isAssignable, isProbablyPrimitive, twoWayCandidates } from './jsx'
import {
  attrName,
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

const REACTIVE_API = new Set(['watch', 'on', 'onMount', 'onCleanup', 'external', 'inspect', 'untrack'])

function stateReadInSetup(data: BodyData, options: AnalyzeOptions, out: Diagnostic[]): void {
  const body = data.scope.fn.get('body')
  if (!body.isBlockStatement()) return
  for (const s of body.get('body')) {
    if (!s.isExpressionStatement()) continue
    const e = unwrap(s.node.expression)
    if (t.isAwaitExpression(e)) continue
    if (t.isCallExpression(e) && t.isIdentifier(e.callee)) {
      const api = importedName(s, e.callee.name)
      if ((api && REACTIVE_API.has(api)) || isUseName(e.callee.name)) continue
    }
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
      let replaceable = false
      let why = ''
      const info = data.body.bindings.get(rootId.name)
      if (info && data.scope.declByName.get(rootId.name)?.binding === binding) {
        if (info.kind === 'resource') {
          replaceable = true
          why = 'vem de um `await`'
        } else if (info.isLet && info.reassigned) {
          replaceable = true
          why = 'é um `let` reatribuído'
        }
      } else if (binding?.kind === 'module' && srcExpr !== rootId) {
        replaceable = true
        why = 'vem de um store'
      }
      if (!replaceable) return
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
      while (
        p &&
        (p.isJSXFragment() ||
          p.isJSXExpressionContainer() ||
          p.isParenthesizedExpression() ||
          (p.isLogicalExpression() && child.key === 'right') ||
          (p.isConditionalExpression() && child.key !== 'test'))
      ) {
        if (p.isJSXExpressionContainer() && p.parentPath?.isJSXAttribute()) break
        child = p
        p = p.parentPath
      }
      const ok =
        !!p &&
        p.isJSXElement() &&
        child.listKey === 'children' &&
        !isIntrinsic(p.node.openingElement.name) &&
        !isSlotElement(p as NodePath<t.JSXElement>)
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
    if (d.body.kind === 'component') {
      flowDiagnostics(d, out)
      continuationResets(d, out)
      stateReadInSetup(d, options, out)
      refNonOptionalInBranch(d, out)
      awaitWaterfall(d, out)
    } else useReturn(d, out)
    refBeforeMount(d, out)
    listConstUsedTwice(d, out)
    watchWithoutReads(d, out)
    preferKey(d, out)
    fetchWithoutSignal(d, out)
    letNeverReassigned(d, out)
  }
  jsxDiagnostics(program, options, data, out)
  out.sort((a, b) => a.loc.line - b.loc.line || a.loc.column - b.loc.column || a.id.localeCompare(b.id))
  return out
}
