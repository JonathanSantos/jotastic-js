// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { DIAGNOSTIC_LEVELS, formatDiagnostic } from '../src/index'
import type { Diagnostic } from '../src/index'
import { run } from './helpers'

const dir = new URL('./diagnostics/', import.meta.url)
const ids = readdirSync(dir).filter((f) => !f.startsWith('.'))

/** IDs de 12-diagnosticos que não são detectáveis estaticamente (runtime em dev / devtools). */
const RUNTIME_ONLY = [
  'derived-mutated',
  'derived-recreates-instance',
  'store-mutated-outside-action',
  'effect-loop',
  'use-outside-owner',
  'list-recreated',
  'binding-hot',
  'memo-never-read',
  'signal-never-set',
]

describe('diagnostics/<id>: input.tsx dispara exatamente o expected.json', () => {
  test.each(ids)('%s', (id) => {
    const code = readFileSync(new URL(`${id}/input.tsx`, dir), 'utf8')
    const expected = JSON.parse(readFileSync(new URL(`${id}/expected.json`, dir), 'utf8')) as Diagnostic[]
    const got = run(code, 'input.tsx').diagnostics.filter((d) => d.id === id)
    expect(expected.length).toBeGreaterThan(0)
    expect(got.map(({ id, level, loc, fix }) => (fix ? { id, level, loc, fix } : { id, level, loc }))).toEqual(expected)
    for (const d of got) {
      expect(d.level).toBe(DIAGNOSTIC_LEVELS[id as keyof typeof DIAGNOSTIC_LEVELS])
      expect(d.message.length).toBeGreaterThan(20)
      expect(d.suggestion).toBeTruthy()
      expect(formatDiagnostic(d, 'input.tsx')).toMatch(
        new RegExp(`^. input\\.tsx:${d.loc.line}:${d.loc.column}  jotastic/${id}\\n`),
      )
    }
  })

  test('todo ID estático do catálogo tem fixture', () => {
    expect([...ids].sort()).toEqual(Object.keys(DIAGNOSTIC_LEVELS).sort())
    for (const id of RUNTIME_ONLY) expect(ids).not.toContain(id)
  })
})

describe('fixes mecânicos produzem o código esperado', () => {
  const applyFix = (id: string) => {
    const code = readFileSync(new URL(`${id}/input.tsx`, dir), 'utf8')
    const d = run(code, 'input.tsx').diagnostics.find((x) => x.id === id)!
    const [a, b] = d.fix!.range
    return code.slice(0, a) + d.fix!.text + code.slice(b)
  }
  test('inner-html-object', () => expect(applyFix('inner-html-object')).toContain('<div innerHTML={html} />'))
  test('class-name-alias', () => expect(applyFix('class-name-alias')).toContain('<div class="field">'))
  test('state-read-in-setup', () =>
    expect(applyFix('state-read-in-setup')).toContain('  watch(() => console.log(count))\n'))
  test('let-never-reassigned', () => expect(applyFix('let-never-reassigned')).toContain("const greeting = 'Olá'"))
  test('sem `code`, fixes que copiam fonte são omitidos', async () => {
    const { parse } = await import('@babel/parser')
    const { analyze } = await import('../src/index')
    const code = readFileSync(new URL('inner-html-object/input.tsx', dir), 'utf8')
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    const d = analyze(ast, { filename: 'x.tsx', isTSX: true, dev: true }).diagnostics[0]
    expect(d.id).toBe('inner-html-object')
    expect(d.fix).toBeUndefined()
  })
})

describe('casos negativos', () => {
  const idsOf = (src: string, file = 'x.tsx') => run(src, file).diagnostics.map((d) => d.id)
  test('ref lido em onMount / handler / external / arg de use* não é ref-before-mount', () => {
    expect(
      idsOf(`import { onMount, external } from 'jotastic'
export function C() {
  let el!: HTMLElement
  onMount(() => el.focus())
  external(() => el.getBoundingClientRect())
  useClickOutside(el, () => {})
  return <div ref={el} onClick={() => el.blur()} />
}
declare function useClickOutside(e: HTMLElement, f: () => void): void`),
    ).not.toContain('ref-before-mount')
  })
  test('watch que lê prop não é watch-without-reads', () => {
    expect(
      idsOf(
        `import { watch } from 'jotastic'\nexport function C({ t }: any) { watch(() => { document.title = t })\nreturn <p /> }`,
      ),
    ).toEqual([])
  })
  test('lista com key / item com id / fonte não reatribuída não pede key', () => {
    expect(
      idsOf(
        `export function C() { let xs: any[] = []\nreturn <ul onClick={() => (xs = [])}>{xs.map((x) => <li key={x}>{x}</li>)}</ul> }`,
      ),
    ).toEqual([])
    expect(
      idsOf(
        `export function C() { let xs: any[] = []\nreturn <ul onClick={() => (xs = [])}>{xs.map((x) => <li data-id={x.id}>{x.n}</li>)}</ul> }`,
      ),
    ).toEqual([])
    expect(idsOf(`export function C({ xs }: any) { return <ul>{xs.map((x: any) => <li>{x}</li>)}</ul> }`)).toEqual([])
  })
  test('awaits dependentes (direta ou transitivamente) não são cascata', () => {
    expect(
      idsOf(`export async function C({ id }: any) {
  const user = await api.user(id)
  const uid = user.id
  const posts = await api.posts(uid)
  return <p>{posts.length}</p>
}`),
    ).not.toContain('await-waterfall')
  })
  test('fetch de jotastic/fetch ou com signal não gera dica', () => {
    expect(
      idsOf(
        `import { fetch } from 'jotastic/fetch'\nexport async function C({ id }: any) { const u = await fetch(id)\nreturn <p>{u}</p> }`,
      ),
    ).toEqual([])
    expect(
      idsOf(
        `import { abortSignal } from 'jotastic'\nexport async function C({ id }: any) { const u = await fetch(id, { signal: abortSignal() })\nreturn <p>{u}</p> }`,
      ),
    ).toEqual([])
  })
  test('value atribuível ou com handler não gera value-not-writable', () => {
    expect(idsOf(`export function C() { let v = ''\nreturn <input value={v} /> }`)).toEqual([])
    expect(idsOf(`export function C({ v }: any) { return <input value={v} onInput={() => {}} /> }`)).toEqual([])
    expect(idsOf(`export function C({ v }: any) { return <input value={v} readOnly /> }`)).toEqual([])
  })
  test('let mutado não é let-never-reassigned', () => {
    expect(idsOf(`export function C() { let o = { a: 1 }\nreturn <p onClick={() => (o.a = 2)}>{o.a}</p> }`)).toEqual([])
    expect(
      idsOf(`export function C() { let l: number[] = []\nreturn <p onClick={() => l.push(1)}>{l.length}</p> }`),
    ).toEqual([])
  })
  test('use* que retorna objeto, stateLiteral, função ou nada', () => {
    expect(idsOf(`export function useA() { let x = 0; const f = () => x++; return { x, f } }`, 'a.ts')).toEqual([])
    expect(idsOf(`export function useA() { const pos = { x: 0 }; return pos }`, 'a.ts')).toEqual([])
    expect(idsOf(`export function useA() { return () => 1 }`, 'a.ts')).toEqual([])
    expect(idsOf(`export function useA(x: number) { if (!x) return\nreturn {} }`, 'a.ts')).toEqual([])
  })
  test('Slot como filho de componente, atravessando fragmento, && e ternário', () => {
    expect(
      idsOf(`import { Slot } from 'jotastic'
export function P({ a }: any) {
  return <Card><><Slot name="x">1</Slot></>{a && <Slot name="y">2</Slot>}{a ? <Slot name="z">3</Slot> : null}</Card>
}`),
    ).toEqual([])
  })
})

describe('exemplos oficiais não geram erros', () => {
  const ex = (f: string) => readFileSync(new URL(`../../../docs/spec/examples/${f}`, import.meta.url), 'utf8')
  test.each([
    '01-counter.tsx',
    '02-todos.tsx',
    '03-form.tsx',
    '04-routes.tsx',
    '07-use-functions.ts',
    '08-store-usage.tsx',
    '08-store.ts',
    '09-external.tsx',
    '10-modal.tsx',
    '11-tabs-context.tsx',
    '13-slots.tsx',
    '14-use-form.ts',
  ])('%s', (f) => {
    expect(run(ex(f), f).diagnostics.filter((d) => d.level === 'error')).toEqual([])
  })
  test('06-async.tsx (sem o import duplicado de `api`)', () => {
    const src = ex('06-async.tsx').replace(/^import \{ api \}.*$/m, '')
    expect(run(src, '06-async.tsx').diagnostics.filter((d) => d.level === 'error')).toEqual([])
  })
})
