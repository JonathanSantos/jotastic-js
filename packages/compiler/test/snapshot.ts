// Normalização de snapshots de docs/spec/compiled/ (mesmo critério de compiled.test.ts): sem comentários, temporárias
// renomeadas por ordem de aparição, specifiers de `jotastic/runtime` ordenados, prettier. Divergências conhecidas
// entram como `AllowEntry`, cada uma citando a pendência; uma entrada que não se aplica mais faz o teste falhar.
import { expect } from 'vitest'
import { parse } from '@babel/parser'
import _generate from '@babel/generator'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import { pretty } from './helpers'

export const traverse: typeof _traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse
const generate: typeof _generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate

/** Temporárias do compilador (`_t0`, `_el`, `_h2`, `_m0`, `_b1`, `_button2`, `_rest`…). */
const TEMP = /^_[A-Za-z]*\d*$/

export interface AllowEntry {
  /** Pendência de docs/spec/21-pendencias.md ou seção da spec que justifica. */
  ref: string
  why: string
  side: 'expected' | 'actual'
  /** Aplica a correção; devolve `true` se mudou algo (entrada viva). */
  apply: (ast: t.File) => boolean
}

export async function normalize(code: string, fixes: AllowEntry[]): Promise<string> {
  const ast = parse(code, { sourceType: 'module' })
  for (const f of fixes) expect(f.apply(ast), `entrada da allowlist não se aplica mais: ${f.ref}`).toBe(true)
  t.traverseFast(ast, (n) => {
    n.leadingComments = n.trailingComments = n.innerComments = null
  })
  ast.comments = []
  for (const s of ast.program.body) {
    if (t.isImportDeclaration(s) && s.source.value === 'jotastic/runtime')
      s.specifiers.sort((a, b) => a.local.name.localeCompare(b.local.name))
  }
  // temporárias → $0, $1… por ordem de aparição, uma por binding (o mesmo `_el3` em duas funções são duas)
  const names = new Map<unknown, string>()
  const renames: Array<[t.Identifier, string]> = []
  traverse(ast, {
    Identifier(p) {
      if (!TEMP.test(p.node.name)) return
      const key = p.scope.getBinding(p.node.name) ?? p.node.name
      if (!names.has(key)) names.set(key, `$${names.size}`)
      renames.push([p.node, names.get(key)!])
    },
  })
  for (const [id, name] of renames) id.name = name
  return pretty(generate(ast).code)
}

/** Compara `actual` com `expected` depois de aplicar as entradas de cada lado. */
export async function compareSnapshot(actual: string, expected: string, fixes: AllowEntry[]): Promise<void> {
  expect(
    await normalize(
      actual,
      fixes.filter((f) => f.side === 'actual'),
    ),
  ).toBe(
    await normalize(
      expected,
      fixes.filter((f) => f.side === 'expected'),
    ),
  )
}

/** Troca strings literais exatas (`loc` de dev). Devolve se todas foram encontradas. */
export function replaceStrings(ast: t.File, map: Record<string, string>): boolean {
  const seen = new Set<string>()
  traverse(ast, {
    StringLiteral(p) {
      const to = map[p.node.value]
      if (to === undefined) return
      seen.add(p.node.value)
      p.node.value = to
      delete p.node.extra
    },
  })
  return Object.keys(map).every((k) => seen.has(k))
}

/** Texto de `export [async] function name…` até a `}` de coluna 0 que o fecha. */
export function sliceFunction(source: string, name: string): string {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^export (async )?function ${name}\\b`).test(l))
  if (start < 0) throw new Error(`função ${name} não encontrada`)
  const end = lines.findIndex((l, i) => i > start && l === '}')
  return lines.slice(start, end + 1).join('\n')
}

/**
 * D64 — PARTE DE LISTAS/`text`, pendente: `text(_m, read)` do snapshot → `insert(pai, read, _m)`, com o pai lido da
 * resolução de nós (`const _m = _p.firstChild` → `_p`; `const _m1 = _m0.nextSibling…` → pai de `_m0`).
 */
export function textToInsert(ast: t.File): boolean {
  const inits = new Map<string, t.Expression>()
  traverse(ast, {
    VariableDeclarator(p) {
      if (t.isIdentifier(p.node.id) && p.node.init) inits.set(p.node.id.name, p.node.init)
    },
  })
  const parentOf = (name: string): string | null => {
    let e = inits.get(name)
    let first: string | null = null
    while (e && t.isMemberExpression(e) && t.isIdentifier(e.property)) {
      first = e.property.name
      e = e.object
    }
    if (!e || !t.isIdentifier(e)) return null
    return first === 'firstChild' ? e.name : first === 'nextSibling' ? parentOf(e.name) : null
  }
  let changed = false
  traverse(ast, {
    CallExpression(p) {
      const { callee, arguments: args } = p.node
      if (!t.isIdentifier(callee, { name: 'text' }) || args.length !== 2) return
      const [node, read] = args as [t.Expression, t.Expression]
      // único filho: `text(_sp.firstChild ?? _sp.appendChild(…), read)` / `text(_b.appendChild(…), read)` → `insert(_sp, read, null)`
      const appended = t.isLogicalExpression(node) ? node.right : node
      if (
        t.isCallExpression(appended) &&
        t.isMemberExpression(appended.callee) &&
        t.isIdentifier(appended.callee.property, { name: 'appendChild' }) &&
        t.isIdentifier(appended.callee.object)
      ) {
        p.replaceWith(t.callExpression(t.identifier('insert'), [appended.callee.object, read, t.nullLiteral()]))
        changed = true
        return
      }
      if (!t.isIdentifier(node)) return
      const parent = parentOf(node.name)
      if (!parent) return
      p.replaceWith(t.callExpression(t.identifier('insert'), [t.identifier(parent), read, node]))
      changed = true
    },
  })
  const imp = ast.program.body[0] as t.ImportDeclaration
  imp.specifiers = imp.specifiers.filter((s) => s.local.name !== 'text')
  return changed
}

/**
 * D58 — PARTE DE LISTAS, pendente: no `render` de cada `list(…)` do snapshot, `item()` → `item` (o compilador ainda
 * passa o item direto). Devolve se mudou algo.
 */
export function lazyItemToValue(ast: t.File): boolean {
  let changed = false
  traverse(ast, {
    CallExpression(p) {
      if (!t.isIdentifier(p.node.callee, { name: 'list' })) return
      const render = p.get('arguments')[3]
      if (!render || !render.isFunction()) return
      const param = render.node.params[0]
      if (!t.isIdentifier(param)) return
      const name = param.name
      render.traverse({
        CallExpression(q) {
          if (t.isIdentifier(q.node.callee, { name }) && !q.node.arguments.length) {
            q.replaceWith(t.identifier(name))
            changed = true
          }
        },
      })
    },
  })
  return changed
}
