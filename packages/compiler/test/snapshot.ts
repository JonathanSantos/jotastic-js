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

/** Texto de `export function name…` até a `}` de coluna 0 que o fecha. */
export function sliceFunction(source: string, name: string): string {
  const lines = source.split('\n')
  const start = lines.findIndex((l) => l.startsWith(`export function ${name}`))
  if (start < 0) throw new Error(`função ${name} não encontrada`)
  const end = lines.findIndex((l, i) => i > start && l === '}')
  return lines.slice(start, end + 1).join('\n')
}
