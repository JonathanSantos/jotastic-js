// Diagnósticos de `use*` e slots (18 §11–§12, §15) e chamadas fora de corpo reativo.
import { describe, expect, test } from 'vitest'
import { compile, CompileError } from '../src/index'

function fail(code: string, filename = 'Bad.tsx'): CompileError {
  try {
    compile(code, { filename })
  } catch (e) {
    expect(e).toBeInstanceOf(CompileError)
    return e as CompileError
  }
  throw new Error('compilou sem erro')
}

describe('use* e slots: erros', () => {
  test('use-return-not-object: `let` solto', () => {
    const e = fail(`export function useX() {\n  let n = 0\n  return n\n}`, 'useX.ts')
    expect(e.id).toBe('use-return-not-object')
    expect(e.loc.line).toBe(3)
  })

  test('slot-not-direct-child: <Slot> dentro de elemento', () => {
    const e = fail(
      `import { Slot } from 'jotastic'\nimport { Card } from './c'\nexport function A() {\n  return <Card><div><Slot name="h">x</Slot></div></Card>\n}`,
    )
    expect(e.id).toBe('slot-not-direct-child')
  })

  test('slot-name-not-literal', () => {
    const e = fail(
      `import { Slot } from 'jotastic'\nimport { Card } from './c'\nexport function A({ n }: { n: string }) {\n  return <Card><Slot name={n}>x</Slot></Card>\n}`,
    )
    expect(e.id).toBe('slot-name-not-literal')
  })
})

describe('use*: chamadas', () => {
  test('fora de corpo reativo: não transformada', () => {
    const { code } = compile(
      `import { useX } from './x'\nexport const r = useX(1)\nfunction helper() { return useX(2) }`,
      {
        filename: 'm.ts',
      },
    )
    expect(code).toContain('useX(1)')
    expect(code).toContain('useX(2)')
  })

  // D59 (U-1): o callee se protege com `_void`; nenhum chamador preenche argumentos ausentes
  test('mesmo módulo: só os argumentos escritos; o callee cobre os ausentes com `_void`', () => {
    const { code } = compile(
      `function useLocal(a: number, b?: string, c = 1) {\n  return { s: a + (b ?? '') + c }\n}\nexport function A() {\n  const r = useLocal(1)\n  return <p>{r.s}</p>\n}`,
      { filename: 'A.tsx' },
    )
    expect(code).toContain('function useLocal(a = _void, b = _void, c = () => 1)')
    expect(code).toContain('useLocal(() => 1)')
    expect(code).not.toContain('() => undefined')
    expect(code).toMatch(/import \{[^}]*\b_void\b[^}]*\} from 'jotastic\/runtime'/)
  })

  test('use-spread-args-unsupported: `useX(...xs)` vira CompileError', () => {
    const e = fail(
      `import { useX } from './x'\nexport function A({ xs }: { xs: number[] }) {\n  const r = useX(...xs)\n  return <p>{r.v}</p>\n}`,
    )
    expect(e.id).toBe('use-spread-args-unsupported')
    expect(e.loc.line).toBe(3)
  })

  test('use-param-assignment: escrita em parâmetro de `use*` vira CompileError', () => {
    const e = fail(`export function useX(url: string) {\n  url = url.trim()\n  return { url }\n}`, 'useX.ts')
    expect(e.id).toBe('use-param-assignment')
    expect(e.loc.line).toBe(2)
  })

  test('imported: sem padding de aridade (não é conhecida)', () => {
    const { code } = compile(
      `import { useX } from './x'\nexport function A({ a }: { a: number }) {\n  const r = useX(a)\n  return <p>{r.v}</p>\n}`,
      { filename: 'A.tsx' },
    )
    expect(code).toContain('useX(() => props.a)')
  })
})
