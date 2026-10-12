// Snapshot: docs/spec/compiled/01-counter.js a partir de docs/spec/examples/01-counter.tsx (lidos direto de docs/).
// Normalização (nos dois lados): sem comentários, temporárias renomeadas por ordem de aparição, specifiers do import
// de `jotastic/runtime` ordenados, formatação pelo prettier. Divergências conhecidas ficam na ALLOWLIST abaixo,
// cada uma com a justificativa; uma entrada que não se aplica mais faz o teste falhar.
import { describe, expect, test } from 'vitest'
import { parse } from '@babel/parser'
import _generate from '@babel/generator'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import { compile } from '../src/index'
import { pretty, spec } from './helpers'
import { textToInsert } from './snapshot'

const traverse: typeof _traverse = (_traverse as unknown as { default?: typeof _traverse }).default ?? _traverse
const generate: typeof _generate = (_generate as unknown as { default?: typeof _generate }).default ?? _generate

/** Temporárias do compilador (`_t0`, `_el`, `_h2`, `_m0`, `_b1`, `_button2`, `_rest`…). */
const TEMP = /^_[A-Za-z]*\d*$/

interface AllowEntry {
  /** Pendência de docs/spec/21-pendencias.md ou seção da spec que justifica. */
  ref: string
  why: string
  side: 'expected' | 'actual'
  /** Aplica a correção; devolve `true` se mudou algo (entrada viva). */
  apply: (ast: t.File) => boolean
}

const ALLOWLIST: Record<string, AllowEntry[]> = {
  '01-counter': [
    {
      ref: 'K-1(a) / 18 §14 (`data-jo="Arquivo.tsx:linha"` no elemento raiz do template)',
      why: 'compiled/01 usa a linha da função (`Counter.tsx:4`); o compilador usa a linha do elemento raiz (`<section>`, linha 14), como em todos os fixtures. Lacuna reportada',
      side: 'expected',
      apply: (ast) => {
        let changed = false
        traverse(ast, {
          StringLiteral(p) {
            const v = p.node.value.replace('data-jo="Counter.tsx:4"', 'data-jo="Counter.tsx:14"')
            if (v !== p.node.value) {
              p.node.value = v
              delete p.node.extra
              changed = true
            }
          },
        })
        return changed
      },
    },
    {
      ref: 'D64 (`text(marker, read)` para escalares) — PARTE DE LISTAS/`text`, pendente',
      why: 'compiled/01 emite `text(_m0, …)`; o compilador ainda emite `insert(_p, …, _m0)`. Remover quando D64 entrar',
      side: 'expected',
      apply: (ast) => textToInsert(ast),
    },
  ],
}

async function normalize(code: string, fixes: AllowEntry[]): Promise<string> {
  const ast = parse(code, { sourceType: 'module' })
  for (const f of fixes) expect(f.apply(ast), `entrada da allowlist não se aplica mais: ${f.ref}`).toBe(true)
  // comentários fora
  t.traverseFast(ast, (n) => {
    n.leadingComments = n.trailingComments = n.innerComments = null
  })
  ast.comments = []
  // specifiers do runtime em ordem alfabética
  for (const s of ast.program.body) {
    if (t.isImportDeclaration(s) && s.source.value === 'jotastic/runtime')
      s.specifiers.sort((a, b) => a.local.name.localeCompare(b.local.name))
  }
  // temporárias → $0, $1… por ordem de aparição
  const names = new Map<string, string>()
  t.traverseFast(ast, (n) => {
    if (t.isIdentifier(n) && TEMP.test(n.name)) {
      if (!names.has(n.name)) names.set(n.name, `$${names.size}`)
      n.name = names.get(n.name)!
    }
  })
  return pretty(generate(ast).code)
}

describe('compiled/ (snapshots de referência)', () => {
  test('01-counter', async () => {
    const fixes = ALLOWLIST['01-counter']!
    const actual = compile(spec('examples/01-counter.tsx'), { filename: 'Counter.tsx', dev: true }).code
    const expected = spec('compiled/01-counter.js')
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
  })
})
