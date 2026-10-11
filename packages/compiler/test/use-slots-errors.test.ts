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

  test('imported: sem padding de aridade (não é conhecida)', () => {
    const { code } = compile(
      `import { useX } from './x'\nexport function A({ a }: { a: number }) {\n  const r = useX(a)\n  return <p>{r.v}</p>\n}`,
      { filename: 'A.tsx' },
    )
    expect(code).toContain('useX(() => props.a)')
  })
})
