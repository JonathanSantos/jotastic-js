/** Tabelas de atributos e eventos (18-transformacoes.md §5.3–§5.5). */
import * as t from '@babel/types'
import { unwrap } from './util'

export type AttributeKind =
  'attr' | 'prop' | 'bool' | 'class' | 'style' | 'ref' | 'event' | 'innerHTML' | 'children' | 'key' | 'ignore'

/** Nome de evento DOM a partir da prop: `onClick` → ['click', false]; `onClickCapture` → ['click', true]; `on:x-y` → ['x-y', false]. */
export function eventName(prop: string): [type: string, capture: boolean] | null {
  if (prop.startsWith('on:')) return prop.length > 3 ? [prop.slice(3), false] : null
  if (!/^on[A-Z]/.test(prop)) return null
  let rest = prop.slice(2)
  let capture = false
  if (rest.length > 'Capture'.length && rest.endsWith('Capture')) {
    rest = rest.slice(0, -'Capture'.length)
    capture = true
  }
  return [rest.toLowerCase(), capture]
}

/** Nomes HTML em minúsculas → nome canônico (propriedade DOM). */
const CANONICAL: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  contenteditable: 'contentEditable',
  crossorigin: 'crossOrigin',
  accesskey: 'accessKey',
  defaultvalue: 'defaultValue',
  defaultchecked: 'defaultChecked',
  innerhtml: 'innerHTML',
  textcontent: 'textContent',
  currenttime: 'currentTime',
  playbackrate: 'playbackRate',
}

/** Normaliza nomes: `className` → `class`, `htmlFor` → `for`, `tabindex` → `tabIndex` (propriedade) etc. */
export function normalizeAttribute(name: string): string {
  return CANONICAL[name] ?? name
}

const PROPS = new Set([
  'value',
  'checked',
  'selected',
  'muted',
  'volume',
  'currentTime',
  'playbackRate',
  'indeterminate',
  'defaultValue',
  'defaultChecked',
])

const BOOLS = new Set([
  'disabled',
  'hidden',
  'required',
  'readonly',
  'multiple',
  'autofocus',
  'open',
  'inert',
  'novalidate',
  'formnovalidate',
  'autoplay',
  'controls',
  'loop',
  'playsinline',
  'default',
  'reversed',
  'ismap',
  'nomodule',
  'allowfullscreen',
  'async',
  'defer',
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

export function isSVGTag(tag: string): boolean {
  return SVG_TAGS.has(tag) || /^fe[A-Z]/.test(tag)
}

/** Decide como um atributo dinâmico é aplicado. Tabela em 18-transformacoes.md §5.3. */
export function attributeKind(tag: string, name: string): AttributeKind {
  const n = normalizeAttribute(name)
  if (n === '__self' || n === '__source' || n === 'dangerouslySetInnerHTML') return 'ignore'
  if (n === 'class') return 'class'
  if (n === 'style') return 'style'
  if (n === 'ref') return 'ref'
  if (n === 'key') return 'key'
  if (n === 'children') return 'children'
  if (eventName(n)) return 'event'
  if (isSVGTag(tag)) return 'attr'
  if (n === 'innerHTML' || n === 'textContent') return 'innerHTML'
  if (PROPS.has(n)) return 'prop'
  if (BOOLS.has(n.toLowerCase())) return 'bool'
  return 'attr'
}

const PRIMITIVE_METHODS = new Set([
  'trim',
  'trimStart',
  'trimEnd',
  'toUpperCase',
  'toLowerCase',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
  'padStart',
  'padEnd',
  'repeat',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'normalize',
  'replace',
  'replaceAll',
  'localeCompare',
  'startsWith',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'join',
  'toFixed',
  'toPrecision',
  'toString',
  'toLocaleString',
  'substring',
  'substr',
  'toExponential',
  'trimLeft',
  'trimRight',
  'search',
  'isWellFormed',
  'toWellFormed',
])

const PRIMITIVE_GLOBALS = new Set(['String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite'])

/** Métodos estáticos de `Number`/`String` que devolvem primitivo. */
const PRIMITIVE_STATICS: Record<string, Set<string>> = {
  Number: new Set(['isInteger', 'isSafeInteger', 'isFinite', 'isNaN', 'parseFloat', 'parseInt']),
  String: new Set(['fromCharCode', 'fromCodePoint', 'raw']),
}

/**
 * `true` se a expressão é sintaticamente "provavelmente primitiva" (18 §3). Na dúvida, `false`.
 * `isPrimitiveId` (opcional, D60): identificador que lê outro `let` já classificado `signal`.
 */
export function isProbablyPrimitive(node: t.Node, isPrimitiveId?: (id: t.Identifier) => boolean): boolean {
  const rec = (x: t.Node) => isProbablyPrimitive(x, isPrimitiveId)
  const n = unwrap(node)
  if (
    t.isStringLiteral(n) ||
    t.isNumericLiteral(n) ||
    t.isBooleanLiteral(n) ||
    t.isNullLiteral(n) ||
    t.isBigIntLiteral(n) ||
    t.isTemplateLiteral(n)
  )
    return true
  if (t.isIdentifier(n))
    return n.name === 'undefined' || n.name === 'NaN' || n.name === 'Infinity' || !!isPrimitiveId?.(n)
  if (t.isUnaryExpression(n)) return true
  if (t.isBinaryExpression(n)) return true
  if (t.isUpdateExpression(n)) return true
  // `a && b`: valores falsy são sempre primitivos, então decide `b`. `a ?? 0`, `a || ''`: decide o fallback.
  if (t.isLogicalExpression(n)) return rec(n.right)
  if (t.isConditionalExpression(n)) return rec(n.consequent) && rec(n.alternate)
  if (t.isMemberExpression(n) || t.isOptionalMemberExpression(n))
    return !n.computed && t.isIdentifier(n.property) && n.property.name === 'length'
  if (t.isCallExpression(n) || t.isOptionalCallExpression(n)) {
    const callee = unwrap(n.callee)
    if (t.isIdentifier(callee)) return PRIMITIVE_GLOBALS.has(callee.name)
    if ((t.isMemberExpression(callee) || t.isOptionalMemberExpression(callee)) && !callee.computed) {
      const prop = t.isIdentifier(callee.property) ? callee.property.name : ''
      const obj = unwrap(callee.object)
      if (t.isIdentifier(obj) && obj.name === 'Math') return true
      if (t.isIdentifier(obj) && obj.name === 'Date' && prop === 'now') return true
      if (t.isIdentifier(obj) && Object.hasOwn(PRIMITIVE_STATICS, obj.name))
        return PRIMITIVE_STATICS[obj.name]!.has(prop)
      return PRIMITIVE_METHODS.has(prop)
    }
  }
  return false
}

/** `true` se a expressão é atribuível (Identifier, MemberExpression; OptionalMember não) — para two-way. */
export function isAssignable(node: t.Node): boolean {
  const n = unwrap(node)
  return t.isIdentifier(n) || t.isMemberExpression(n)
}

/**
 * `kind` do `twoWay` (17-contratos §Two-way) para `tag`/`attr` dado o `type` literal (`undefined` = ausente,
 * `null` = dinâmico). `null` = nunca two-way. Auxiliar interno (não faz parte do contrato público).
 */
export function twoWayKind(
  tag: string,
  attr: string,
  type: string | null | undefined,
  multiple = false,
): 'value' | 'number' | 'checked' | 'select' | 'multiple' | null {
  if (tag === 'select') return attr === 'value' ? (multiple ? 'multiple' : 'select') : null
  if (tag === 'textarea') return attr === 'value' ? 'value' : null
  if (tag !== 'input') return null
  if (type === 'radio' || type === 'file') return null
  if (attr === 'checked') return type === 'checkbox' ? 'checked' : null
  if (attr !== 'value') return null
  if (type === 'checkbox') return null
  if (type === 'number' || type === 'range') return 'number'
  return 'value'
}

export type TwoWayKind = 'value' | 'number' | 'checked' | 'select' | 'multiple'

/**
 * Atributos `value`/`checked` de `el` elegíveis a two-way pelas regras de 18 §5.5, sem olhar a expressão
 * (o chamador verifica `isAssignable` e se é prop). Auxiliar interno.
 */
export function twoWayCandidates(
  el: t.JSXOpeningElement,
): Array<{ attr: t.JSXAttribute; expr: t.Expression; kind: TwoWayKind }> {
  if (!t.isJSXIdentifier(el.name)) return []
  const tag = el.name.name
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return []
  const find = (n: string) =>
    el.attributes.find(
      (a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === n,
    ) ??
    el.attributes.find(
      (a): a is t.JSXAttribute =>
        t.isJSXAttribute(a) && t.isJSXNamespacedName(a.name) && `${a.name.namespace.name}:${a.name.name.name}` === n,
    )
  if (find('onInput') || find('onChange') || find('on:input') || find('on:change')) return []
  if (find('readOnly') || find('readonly')) return []
  const disabled = find('disabled')
  if (
    disabled &&
    (disabled.value == null ||
      (t.isJSXExpressionContainer(disabled.value) && t.isBooleanLiteral(disabled.value.expression, { value: true })))
  )
    return []
  const typeAttr = find('type')
  let type: string | null | undefined
  if (typeAttr) {
    const v = typeAttr.value
    if (t.isStringLiteral(v)) type = v.value
    else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) type = v.expression.value
    else type = null
  }
  const multipleAttr = find('multiple')
  const multiple =
    !!multipleAttr &&
    (multipleAttr.value == null ||
      (t.isJSXExpressionContainer(multipleAttr.value) &&
        t.isBooleanLiteral(multipleAttr.value.expression, { value: true })))
  const out: Array<{ attr: t.JSXAttribute; expr: t.Expression; kind: TwoWayKind }> = []
  for (const name of ['value', 'checked']) {
    const attr = find(name)
    if (!attr || !t.isJSXExpressionContainer(attr.value) || t.isJSXEmptyExpression(attr.value.expression)) continue
    const kind = twoWayKind(tag, name, type, multiple)
    if (kind) out.push({ attr, expr: attr.value.expression, kind })
  }
  return out
}
