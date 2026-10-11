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
      'early return',
      `export function A({ x }: { x: boolean }) {\n  if (x) return <p />\n  return <b />\n}`,
      2,
      /early return/,
    ],
    ['await', `export async function A() {\n  const u = await fetch('/x')\n  return <p>{u}</p>\n}`, 2, /await/],
    [
      'condicional',
      `export function A({ x }: { x: boolean }) {\n  return <div>{x && <p />}</div>\n}`,
      2,
      /condicional/,
    ],
    [
      'lista',
      `export function A({ xs }: { xs: string[] }) {\n  return <ul>{xs.map((x) => <li>{x}</li>)}</ul>\n}`,
      2,
      /lista/,
    ],
    [
      'slot',
      `import { Slot } from 'jotastic'\nimport { Card } from './c'\nexport function A() {\n  return <Card><Slot name="h"><b /></Slot></Card>\n}`,
      4,
      /Slot/,
    ],
    ['use*', `export function useX(a: number) {\n  let n = a\n  return { n }\n}`, 1, /use\*/, 'useX.ts'],
    [
      'chamada use*',
      `import { useX } from './x'\nexport function A() {\n  const r = useX(1)\n  return <p>{r.n}</p>\n}`,
      3,
      /use\*/,
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
