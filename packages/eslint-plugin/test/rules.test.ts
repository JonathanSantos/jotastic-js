import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, test } from 'vitest'
import { Linter, RuleTester } from 'eslint'
import * as tsParser from '@typescript-eslint/parser'
import { DIAGNOSTIC_LEVELS, type Diagnostic, type DiagnosticId } from '@jotastic/analyzer'
import plugin, { rules } from '../src/index'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const fixtures = new URL('../../analyzer/test/diagnostics/', import.meta.url)
const examples = new URL('../../../docs/spec/examples/', import.meta.url)
const ids = readdirSync(fixtures).filter((f) => !f.startsWith('.')) as DiagnosticId[]

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
})

const counter = readFileSync(new URL('01-counter.tsx', examples), 'utf8')

/** Casos válidos específicos (além do contador oficial, válido para todas as regras). */
const VALID: Partial<Record<DiagnosticId, string[]>> = {
  'class-name-alias': ['export function C() { return <div class="a"><label for="x">x</label></div> }'],
  'let-never-reassigned': ['export function C() { let o = { a: 1 }\nreturn <p onClick={() => (o.a = 2)}>{o.a}</p> }'],
  'inner-html-object': ['export function C({ html }: { html: string }) { return <div innerHTML={html} /> }'],
  'state-read-in-setup': [
    "import { watch } from 'jotastic'\nexport function C({ n }: { n: number }) { watch(() => console.log(n))\nreturn <p>{n}</p> }",
  ],
  'value-not-writable': ["export function C() { let v = ''\nreturn <input value={v} /> }"],
}

const applyFixes = (code: string, ds: Diagnostic[]) =>
  ds
    .filter((d) => d.fix)
    .sort((a, b) => b.fix!.range[0] - a.fix!.range[0])
    .reduce((out, d) => out.slice(0, d.fix!.range[0]) + d.fix!.text + out.slice(d.fix!.range[1]), code)

test('uma regra por ID estático, todos com fixture', () => {
  expect(Object.keys(rules).sort()).toEqual(Object.keys(DIAGNOSTIC_LEVELS).sort())
  expect([...ids].sort()).toEqual(Object.keys(rules).sort())
})

for (const id of ids) {
  const code = readFileSync(new URL(`${id}/input.tsx`, fixtures), 'utf8')
  const expected = JSON.parse(readFileSync(new URL(`${id}/expected.json`, fixtures), 'utf8')) as Diagnostic[]
  const hasFix = expected.some((d) => d.fix)
  ruleTester.run(id, rules[id], {
    valid: [counter, ...(VALID[id] ?? [])].map((c) => ({ code: c, filename: 'valid.tsx' })),
    invalid: [
      {
        code,
        filename: 'input.tsx',
        output: hasFix ? applyFixes(code, expected) : null,
        // O ESLint reporta coluna 1-based: deve bater com o `loc` do analyzer.
        errors: expected.map((d) => ({
          messageId: id,
          line: d.loc.line,
          column: d.loc.column,
          endLine: d.loc.endLine,
          endColumn: d.loc.endColumn,
        })),
      },
    ],
  })
}

describe('configs.recommended', () => {
  const linter = new Linter({ configType: 'flat', cwd: fileURLToPath(new URL('../../../', import.meta.url)) })
  const config = [{ rules: { 'prefer-const': 'error' as const } }, plugin.configs.recommended]

  test('níveis seguem o catálogo; prefer-const desligado', () => {
    const r = plugin.configs.recommended.rules!
    for (const [id, level] of Object.entries(DIAGNOSTIC_LEVELS))
      expect(r[`jotastic/${id}`]).toBe(level === 'error' ? 'error' : 'warn')
    expect(r['prefer-const']).toBe('off')
  })

  test('01-counter.tsx sem erros', () => {
    const file = fileURLToPath(new URL('01-counter.tsx', examples))
    const messages = linter.verify(counter, config, file)
    expect(messages).toEqual([])
  })

  test('aplica as regras e o autofix em .tsx', () => {
    const code = readFileSync(new URL('let-never-reassigned/input.tsx', fixtures), 'utf8')
    const messages = linter.verify(code, config, 'Greeting.tsx')
    expect(messages.map((m) => [m.ruleId, m.severity])).toEqual([['jotastic/let-never-reassigned', 1]])
    expect(linter.verifyAndFix(code, config, 'Greeting.tsx').output).toContain("const greeting = 'Olá'")
  })

  test('erro do Babel (A-11) não derruba as regras', () => {
    const messages = linter.verify(
      "import { api } from './api'\ndeclare const api: any\nexport function C() { return <p>{api}</p> }",
      [plugin.configs.recommended],
      'x.tsx',
    )
    expect(messages.filter((m) => m.fatal)).toEqual([])
  })
})
