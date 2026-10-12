/**
 * JSX → template hoisted + resolução de nós + bindings (18 §5). Também despacha fragmentos e componentes e posiciona
 * os statements gerados no código (`place`).
 *
 * Estratégia: cada JSX é compilado "por fora": o JSX aninhado em expressões (getters de props, arrays de filhos,
 * callbacks) fica cru dentro do código gerado e é compilado na rodada seguinte de `module.ts`, já na posição final
 * (onde há um statement âncora para os `const _el = …`).
 */
import * as t from '@babel/types'
import type { NodePath } from '@babel/traverse'
import { gid, type BodyContext } from '../context'
import { autofocusBinding, elementAttribute, elementSpread, escapeAttr, type AttrResult } from './bindings'
import { compileComponent, isInComponentChildren } from './components'
import { childValue, isInFlow, isListChild, listStatement } from './flow'
import { arrow, attrName, isIntrinsic, jsxName } from './util'

export interface Compiled {
  stmts: t.Statement[]
  expr: t.Expression
}

// ─── Filhos ──────────────────────────────────────────────────────────────────

export type Child =
  | { kind: 'text'; value: string }
  | { kind: 'element'; path: NodePath<t.JSXElement> }
  | { kind: 'component'; path: NodePath<t.JSXElement> }
  | { kind: 'expression'; path: NodePath<t.Expression> }

/** Regras de whitespace de texto JSX do React (18 §5.1). */
export function cleanJSXText(value: string): string {
  const lines = value.split(/\r\n|\n|\r/)
  let lastNonEmpty = 0
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i]!)) lastNonEmpty = i
  let out = ''
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.replace(/\t/g, ' ')
    if (i !== 0) line = line.replace(/^[ ]+/, '')
    if (i !== lines.length - 1) line = line.replace(/[ ]+$/, '')
    if (line) {
      if (i !== lastNonEmpty) line += ' '
      out += line
    }
  }
  return out
}

/** Filhos normalizados: texto limpo e mesclado, fragmentos achatados, `{literal}` como texto. */
export function childrenOf(path: NodePath<t.JSXElement | t.JSXFragment>, ctx: BodyContext): Child[] {
  const out: Child[] = []
  const text = (s: string) => {
    const last = out[out.length - 1]
    if (last?.kind === 'text') last.value += s
    else out.push({ kind: 'text', value: s })
  }
  const element = (p: NodePath<t.JSXElement>) =>
    out.push({ kind: isIntrinsic(p.node.openingElement.name) ? 'element' : 'component', path: p })
  const fragment = (p: NodePath<t.JSXFragment>) => {
    for (const c of childrenOf(p, ctx)) {
      if (c.kind === 'text') text(c.value)
      else out.push(c)
    }
  }
  const kids = path.get('children')
  // `{/* comentário */}`: o espaço em branco encostado nele não vira texto (K-10)
  const isComment = (k: NodePath | undefined) =>
    !!k && k.isJSXExpressionContainer() && t.isJSXEmptyExpression(k.node.expression)
  kids.forEach((c, i) => {
    if (c.isJSXText()) {
      const s = cleanJSXText(c.node.value)
      if (!s.trim() && (isComment(kids[i - 1]) || isComment(kids[i + 1]))) return
      if (s) text(s)
    } else if (c.isJSXElement()) element(c)
    else if (c.isJSXFragment()) fragment(c)
    else if (c.isJSXSpreadChild()) ctx.mod.notImplemented(c.node, 'spread de filhos (`{...xs}`)')
    else if (c.isJSXExpressionContainer()) {
      const e = c.get('expression')
      if (e.isJSXEmptyExpression()) return
      const n = e.node
      if (t.isStringLiteral(n)) text(n.value)
      else if (t.isNumericLiteral(n)) text(String(n.value))
      else if (t.isTemplateLiteral(n) && n.expressions.length === 0) text(n.quasis[0]?.value.cooked ?? '')
      else if (t.isBooleanLiteral(n) || t.isNullLiteral(n) || t.isIdentifier(n, { name: 'undefined' })) return
      else if (e.isJSXElement()) element(e)
      else if (e.isJSXFragment()) fragment(e)
      else out.push({ kind: 'expression', path: e as NodePath<t.Expression> })
    }
  })
  return out.filter((c) => c.kind !== 'text' || c.value !== '')
}

// ─── Despacho ────────────────────────────────────────────────────────────────

export function compileJSX(path: NodePath<t.JSXElement | t.JSXFragment>, ctx: BodyContext): Compiled {
  // dentro de branch/item/continuação: `ref` ganha `onCleanup`, `autofocus` ganha `autofocus(el)` (18 §5.3, §5.6)
  ctx.inFlow = isInFlow(path, ctx)
  ctx.inChildren = isInComponentChildren(path, ctx)
  if (path.isJSXFragment()) return { stmts: [], expr: compileFragment(path, ctx) }
  const el = path as NodePath<t.JSXElement>
  if (!isIntrinsic(el.node.openingElement.name)) return { stmts: [], expr: compileComponent(el, ctx) }
  return compileElement(el, ctx)
}

/**
 * `<>a b</>`: cada root vira um item; o resultado é um array (18 §5.7). Elementos ficam crus e são compilados na
 * próxima rodada; `{…}` vira accessor.
 */
function compileFragment(path: NodePath<t.JSXFragment>, ctx: BodyContext): t.Expression {
  const items = childrenOf(path, ctx).map((c): t.Expression => {
    if (c.kind === 'text') return t.stringLiteral(c.value)
    if (c.kind === 'expression') return childValue(c.path, ctx)
    return c.path.node
  })
  if (items.length === 0) return t.nullLiteral()
  if (items.length === 1) return items[0]!
  return t.arrayExpression(items)
}

// ─── Elemento intrínseco → template ─────────────────────────────────────────

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

const SVG_TAGS = new Set([
  'svg',
  'path',
  'circle',
  'rect',
  'g',
  'line',
  'polyline',
  'polygon',
  'ellipse',
  'text',
  'tspan',
  'textPath',
  'defs',
  'use',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'linearGradient',
  'radialGradient',
  'stop',
  'image',
  'marker',
  'filter',
  'foreignObject',
  'desc',
  'metadata',
  'switch',
  'view',
  'animate',
  'animateMotion',
  'animateTransform',
  'set',
  'mpath',
])

function isSVGTag(tag: string): boolean {
  return SVG_TAGS.has(tag) || /^fe[A-Z]/.test(tag)
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

interface ElNode {
  kind: 'el'
  tag: string
  children: TNode[]
  ref?: string
  needed: boolean
}
interface MarkerNode {
  kind: 'marker'
  ref?: string
  needed: true
}
interface TextNode {
  kind: 'text'
  needed: false
}
type TNode = ElNode | MarkerNode | TextNode

/** Nome de ref legível a partir da tag (`h2` → `_h2`, `my-el` → `_myEl`). */
function refBase(tag: string): string {
  const s = tag.replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''))
  return `_${s || 'el'}`
}

function compileElement(path: NodePath<t.JSXElement>, ctx: BodyContext): Compiled {
  const mod = ctx.mod
  const rootTag = jsxName(path.node.openingElement.name)
  const svgRoot = isSVGTag(rootTag)
  let html = ''
  /** Bindings em pré-ordem (atributos do elemento, depois filhos). */
  const bindings: Array<{ node: ElNode | MarkerNode; emit: (el: string, marker?: string) => t.Statement[] }> = []

  const build = (p: NodePath<t.JSXElement>, svg: boolean, isRoot: boolean): ElNode => {
    const opening = p.node.openingElement
    const tag = jsxName(opening.name)
    const inSvg = svg || tag === 'svg'
    const node: ElNode = { kind: 'el', tag, children: [], needed: false }
    html += `<${tag}`
    if (isRoot && mod.opts.dev && ctx.dataJo.has(p.node) && p.node.loc)
      html += ` data-jo="${escapeAttr(`${mod.file}:${p.node.loc.start.line}`)}"`
    const deferred: AttrResult[] = []
    let childrenAttr: NodePath<t.Expression> | null = null
    const take = (r: AttrResult | null) => {
      if (!r) return
      if (r.kind === 'static') html += r.html
      else if (r.kind === 'binding') {
        if (r.deferred) deferred.push(r)
        else bindings.push({ node, emit: r.emit })
      }
    }
    for (const a of p.get('openingElement').get('attributes')) {
      if (a.isJSXSpreadAttribute()) {
        take(elementSpread(ctx, a.node.argument))
        continue
      }
      const attr = a as NodePath<t.JSXAttribute>
      if (attrName(attr.node) === 'children') {
        const v = attr.get('value')
        if (v.isJSXExpressionContainer() && !v.get('expression').isJSXEmptyExpression())
          childrenAttr = v.get('expression') as NodePath<t.Expression>
        continue
      }
      take(elementAttribute(ctx, tag, inSvg, attr))
      take(autofocusBinding(ctx, attr))
    }
    html += '>'
    if (VOID.has(tag) && !inSvg) {
      for (const r of deferred) take({ ...r, deferred: false } as AttrResult)
      return node
    }

    const childSvg = inSvg && tag !== 'foreignObject'
    const children = childrenOf(p, ctx)
    if (children.length === 0 && childrenAttr) children.push({ kind: 'expression', path: childrenAttr })
    const dynamic = (c: Child) => c.kind === 'component' || c.kind === 'expression'
    const value = (c: Child): t.Expression =>
      c.kind === 'component' ? c.path.node : childValue((c as Extract<Child, { kind: 'expression' }>).path, ctx)

    const only = children.length === 1 ? children[0]! : null
    if (only?.kind === 'expression' && isListChild(only.path, ctx)) {
      // lista como único filho → list(el, null, …)
      const e = only.path.node
      bindings.push({ node, emit: (el) => listStatement(ctx, e, el, null) })
    } else if (only && dynamic(only)) {
      // único conteúdo dinâmico → insert(el, read, null)
      const v = value(children[0]!)
      bindings.push({ node, emit: (el) => [t.expressionStatement(mod.call('insert', [gid(el), v, t.nullLiteral()]))] })
    } else {
      for (const c of children) {
        if (c.kind === 'text') {
          html += escapeText(c.value)
          node.children.push({ kind: 'text', needed: false })
        } else if (c.kind === 'element') {
          node.children.push(build(c.path, childSvg, false))
        } else if (c.kind === 'expression' && isListChild(c.path, ctx)) {
          // lista → statement `list(parent, marker, …)` (não é valor de `insert`)
          html += '<!>'
          const marker: MarkerNode = { kind: 'marker', needed: true }
          node.children.push(marker)
          const e = c.path.node
          bindings.push({ node: marker, emit: (_m, markerRef) => listStatement(ctx, e, node.ref!, markerRef!) })
        } else {
          html += '<!>'
          const marker: MarkerNode = { kind: 'marker', needed: true }
          node.children.push(marker)
          const v = value(c)
          // escalar (D64, 18 §5.1): `text(marker, read)` troca o `<!>` por um Text; resto → `insert`
          const scalar = c.kind === 'expression' && mod.textContainers.has(c.path.parent)
          bindings.push({
            node: marker,
            emit: (_m, markerRef) => [
              t.expressionStatement(
                scalar
                  ? mod.call('text', [gid(markerRef!), v])
                  : mod.call('insert', [gid(node.ref!), v, gid(markerRef!)]),
              ),
            ],
          })
        }
      }
    }
    for (const r of deferred) if (r.kind === 'binding') bindings.push({ node, emit: r.emit })
    html += `</${tag}>`
    return node
  }

  const root = build(path, svgRoot, true)

  // quais nós precisam de referência: com binding, marcadores e ancestrais deles
  const withBinding = new Set(bindings.map((b) => b.node))
  const mark = (n: TNode): boolean => {
    if (n.kind === 'text') return false
    if (n.kind === 'marker') return true
    let any = withBinding.has(n)
    for (const c of n.children) if (mark(c)) any = true
    n.needed = any
    return any
  }
  mark(root)

  const elName = ctx.name('_el')
  root.ref = elName
  const stmts: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(gid(elName), t.callExpression(mod.template(html, svgRoot), [])),
    ]),
  ]
  // caminho mais curto com firstChild/nextSibling a partir do nó anterior já resolvido (18 §5.2)
  const resolve = (el: ElNode) => {
    let prev: { ref: string; index: number } | null = null
    el.children.forEach((c, i) => {
      if (!c.needed) return
      let expr: t.Expression
      let steps: number
      if (prev) {
        expr = gid(prev.ref)
        steps = i - prev.index
      } else {
        expr = t.memberExpression(gid(el.ref!), t.identifier('firstChild'))
        steps = i
      }
      for (let k = 0; k < steps; k++) expr = t.memberExpression(expr, t.identifier('nextSibling'))
      const ref = c.kind === 'marker' ? ctx.name('_m', true) : ctx.name(refBase(c.tag))
      ;(c as ElNode | MarkerNode).ref = ref
      stmts.push(t.variableDeclaration('const', [t.variableDeclarator(gid(ref), expr)]))
      prev = { ref, index: i }
      if (c.kind === 'el') resolve(c)
    })
  }
  resolve(root)

  for (const b of bindings) {
    if (b.node.kind === 'marker') stmts.push(...b.emit(b.node.ref!, b.node.ref))
    else stmts.push(...b.emit(b.node.ref!))
  }
  return { stmts, expr: gid(elName) }
}

// ─── Posicionamento ──────────────────────────────────────────────────────────

/** Limite de avaliação condicional/repetida: os statements não podem subir além dele. */
function isBoundary(cur: NodePath, child: NodePath): boolean {
  if (cur.isConditionalExpression()) return child.key !== 'test'
  if (cur.isLogicalExpression()) return child.key === 'right'
  if (cur.isOptionalCallExpression() || cur.isOptionalMemberExpression()) return true
  if (cur.isAssignmentPattern()) return child.key === 'right'
  if (cur.isLoop()) return child.key === 'test' || child.key === 'update'
  if (cur.isFunction() || cur.isClass() || cur.isProgram()) return true
  return false
}

/**
 * Troca o JSX em `path` por `c.expr` e coloca `c.stmts` antes do statement âncora (ou no corpo de uma arrow de
 * expressão, que vira bloco). Em posição condicional, usa expressão de sequência com `let` declarado no escopo.
 * Devolve `true` quando o corpo de uma arrow virou bloco: os paths irmãos ainda na fila da travessia ficam velhos
 * (o path do corpo passa a apontar para o bloco) e quem chama precisa recomeçar a travessia (X-8).
 */
export function place(path: NodePath, c: Compiled): boolean {
  if (!c.stmts.length) {
    path.replaceWith(c.expr)
    return false
  }
  let child: NodePath = path
  let cur: NodePath | null = path.parentPath
  while (cur) {
    if (cur.isArrowFunctionExpression() && child.key === 'body') {
      path.replaceWith(c.expr)
      const body = cur.node.body as t.Expression
      cur.get('body').replaceWith(t.blockStatement([...c.stmts, t.returnStatement(body)]))
      return true
    }
    if (isBoundary(cur, child)) break
    if (cur.isStatement() && !cur.isBlockStatement()) {
      cur.insertBefore(c.stmts)
      path.replaceWith(c.expr)
      return false
    }
    child = cur
    cur = cur.parentPath
  }
  // fallback: (_el = _t0(), insert(...), _el) com `let _el` no escopo da função
  const scope = path.scope.getFunctionParent() ?? path.scope.getProgramParent()
  const exprs: t.Expression[] = []
  for (const s of c.stmts) {
    if (t.isVariableDeclaration(s)) {
      for (const d of s.declarations) {
        scope.push({ id: gid((d.id as t.Identifier).name), kind: 'let' })
        exprs.push(t.assignmentExpression('=', gid((d.id as t.Identifier).name), d.init ?? t.identifier('undefined')))
      }
    } else if (t.isExpressionStatement(s)) exprs.push(s.expression)
  }
  path.replaceWith(t.sequenceExpression([...exprs, c.expr]))
  return false
}

/** Thunk para JSX fora de corpo reativo (18 §13). */
export function thunk(c: Compiled): t.ArrowFunctionExpression {
  return c.stmts.length ? arrow(t.blockStatement([...c.stmts, t.returnStatement(c.expr)])) : arrow(c.expr)
}
