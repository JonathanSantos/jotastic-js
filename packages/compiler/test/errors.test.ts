// Diagnósticos (18 §15, formato de 12) e ganchos da parte 2 (lançam `not-implemented` com loc).
import { describe, expect, test } from 'vitest'
import { transformSync } from '@babel/core'
import jotasticBabelPlugin, { compile, CompileError } from '../src/index'

function fail(code: string, filename = 'Bad.tsx'): CompileError {
  try {
    compile(code, { filename })
  } catch (e) {
    expect(e).toBeInstanceOf(CompileError)
    return e as CompileError
  }
  throw new Error('compilou sem erro')
}

describe('diagnósticos', () => {
  test('erro do analyzer impede a emissão, com loc e formato de 12', () => {
    const e = fail(`export function List({ items }: { items: string[] }) {
  for (const i of items) {
    if (i) return <p>{i}</p>
  }
  return <ul />
}`)
    expect(e.id).toBe('return-in-loop-or-try')
    expect(e.loc).toEqual({ line: 3, column: 12 })
    expect(e.message).toMatch(/^✖ Bad\.tsx:3:12 {2}jotastic\/return-in-loop-or-try\n {2}Este `return`/)
    expect(e.message).toContain('Sugestão:')
  })

  test('avisos e dicas não impedem a emissão e voltam em `diagnostics`', () => {
    const r = compile(`export function A() { return <p className="x" /> }`, { filename: 'A.tsx' })
    expect(r.diagnostics.map((d) => d.id)).toContain('class-name-alias')
    expect(r.code).toContain(`template('<p data-jo="A.tsx:1" class="x"></p>')`)
  })

  test('sourcemap aponta para o arquivo de entrada', () => {
    const r = compile(`export function A() {\n  return <p>{1 + 1}</p>\n}`, { filename: 'src/A.tsx' })
    expect(r.map?.sources).toEqual(['src/A.tsx'])
    expect(r.map?.mappings.length).toBeGreaterThan(0)
  })
})

describe('ganchos da parte 2 (not-implemented com loc)', () => {
  const cases: Array<[string, string, number, RegExp, string?]> = [
    [
      'const de lista fora de filho de elemento',
      `export function A({ xs }: { xs: string[] }) {\n  const rows = xs.map((x) => <li>{x}</li>)\n  return <>{rows}</>\n}`,
      3,
      /`const` de lista/,
    ],
    [
      'índice de lista desestruturado',
      `export function A({ xs }: { xs: string[] }) {\n  return <ul>{xs.map((x, { length }) => <li>{x}</li>)}</ul>\n}`,
      2,
      /índice de lista/,
    ],
    [
      '`await` fora de statement do escopo raiz',
      `export async function A() {\n  const u = 1\n  return <p>{await f(u)}</p>\n}`,
      3,
      /`await` fora de um statement/,
    ],
    [
      '`await` dentro de expressão de declaração',
      `export async function A() {\n  const n = (await f()).length\n  return <p>{n}</p>\n}`,
      2,
      /`const x = await …`/,
    ],
    [
      '`await` em `use*`',
      `export async function useX() {\n  const n = await f()\n  return { n }\n}`,
      2,
      /`use\*`/,
      'useX.ts',
    ],
    [
      // 18 §12 não diz para onde vai o lado sem `<Slot>` de um ternário (lacuna da parte 2b)
      'filho comum em condicional com <Slot>',
      `import { Slot } from 'jotastic'\nimport { Card } from './c'\nexport function A({ x }: { x: boolean }) {\n  return <Card>{x ? <Slot name="h"><b /></Slot> : <i />}</Card>\n}`,
      4,
      /condicional com `<Slot>`/,
    ],
  ]
  for (const [name, code, line, msg, filename] of cases) {
    test(name, () => {
      const e = fail(code, filename)
      expect(e.id).toBe('not-implemented')
      expect(e.loc.line).toBe(line)
      expect(e.message).toMatch(msg)
      expect(e.message).toContain('parte 2')
    })
  }
})

describe('plugin Babel', () => {
  test('mesma transformação dentro de um pipeline Babel', () => {
    const out = transformSync(`export function A({ n }) { return <p>{n}</p> }`, {
      filename: 'A.jsx',
      configFile: false,
      babelrc: false,
      parserOpts: { plugins: ['jsx'] },
      plugins: [[jotasticBabelPlugin, { dev: false }]],
    })!.code!
    expect(out).toMatch(/import \{ template, insert \} from ["']jotastic\/runtime["']/)
    expect(out).toContain(`insert(_el, () => props.n, null)`)
  })
})
