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
      ref: '18 §14 (dev: `data-jo` no elemento raiz do template de cada componente)',
      why: 'compiled/01 foi escrito antes do `data-jo`; o compilador segue 18 §14 e emite `data-jo="Counter.tsx:14"`',
      side: 'actual',
      apply: (ast) => {
        let changed = false
        traverse(ast, {
          StringLiteral(p) {
            const v = p.node.value.replace(/ data-jo="[^"]*"/g, '')
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
      ref: '18 §13–§14 (`mount(el, target)` recebe o thunk; `mount` continua importado de `jotastic`)',
      why: 'compiled/01 chama `createRoot(document.querySelector(…), thunk)` do runtime; 18 manda `mount(thunk, alvo)`',
      side: 'expected',
      apply: (ast) => {
        let changed = false
        traverse(ast, {
          CallExpression(p) {
            const { callee, arguments: args } = p.node
            if (!t.isIdentifier(callee, { name: 'createRoot' }) || args.length !== 2) return
            const target = args[0]
            if (!t.isCallExpression(target) || !t.isStringLiteral(target.arguments[0])) return
            p.replaceWith(t.callExpression(t.identifier('mount'), [args[1] as t.Expression, target.arguments[0]]))
            changed = true
          },
        })
        const body = ast.program.body
        body.splice(
          1,
          0,
          t.importDeclaration(
            [t.importSpecifier(t.identifier('mount'), t.identifier('mount'))],
            t.stringLiteral('jotastic'),
          ),
        )
        return changed
      },
    },
    {
      ref: '18 §14 (imports de `jotastic/runtime` gerados por uso)',
      why: 'compiled/01 importa `untrack` e `createRoot` sem usá-los (depois da entrada anterior)',
      side: 'expected',
      apply: (ast) => {
        const imp = ast.program.body[0] as t.ImportDeclaration
        const before = imp.specifiers.length
        imp.specifiers = imp.specifiers.filter(
          (s) =>
            !(
              t.isImportSpecifier(s) &&
              t.isIdentifier(s.imported) &&
              ['untrack', 'createRoot'].includes(s.imported.name)
            ),
        )
        return imp.specifiers.length !== before
      },
    },
    {
      ref: 'loc 1-based (A-7) medido no exemplo',
      why: '`mount(<Counter step={5} />)` está na linha 26 de examples/01-counter.tsx; compiled/01 diz 27',
      side: 'expected',
      apply: (ast) => {
        let changed = false
        traverse(ast, {
          StringLiteral(p) {
            if (p.node.value === 'Counter.tsx:27:7') {
              p.node.value = 'Counter.tsx:26:7'
              delete p.node.extra
              changed = true
            }
          },
        })
        return changed
      },
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
