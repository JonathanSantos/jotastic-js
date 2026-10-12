// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { DIAGNOSTIC_LEVELS, formatDiagnostic } from '../src/index'
import type { Diagnostic } from '../src/index'
import { body, kinds, run } from './helpers'

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
  'not-compiled',
  'mount-target-missing',
  'context-missing',
  'list-duplicate-key',
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

describe('A-10: state-read-in-setup só para leitura solta e console.*', () => {
  const ids = (src: string) => run(src, 'x.tsx').diagnostics.map((d) => d.id)
  test('chamada de método / função não avisa', () => {
    expect(ids(`export function C({ tabs, id }: any) { tabs.register(id)\nreturn <p /> }`)).toEqual([])
    expect(
      ids(`export function C({ id }: any) { track(id)\nreturn <p /> }\ndeclare function track(x: any): void`),
    ).toEqual([])
    expect(ids(`export function C({ n }: any) { let x = 0\nx = n\nreturn <p>{x}</p> }`)).not.toContain(
      'state-read-in-setup',
    )
  })
  test('leitura solta e console.* avisam', () => {
    expect(ids(`export function C({ n }: any) { n\nreturn <p /> }`)).toEqual(['state-read-in-setup'])
    expect(ids(`export function C({ n }: any) { n.a + 1\nreturn <p /> }`)).toEqual(['state-read-in-setup'])
    expect(ids(`export function C({ n }: any) { console.warn('x', n)\nreturn <p /> }`)).toEqual(['state-read-in-setup'])
  })
  test('console local (sombreado) não é o global', () => {
    expect(
      ids(`export function C({ n }: any) { const console = { log(_: any) {} }\nconsole.log(n)\nreturn <p /> }`),
    ).toEqual([])
  })
})

describe('X-12: prefer-key-in-list só com item primitivo / literal sem id', () => {
  const ids = (src: string) => run(src, 'x.tsx').diagnostics.map((d) => d.id)
  test('literais de objeto sem id em let reatribuído avisam', () => {
    expect(
      ids(
        `export function C() { let xs = [{ n: 1 }]\nreturn <ul onClick={() => (xs = [...xs, { n: 2 }])}>{xs.map((x) => <li>{x.n}</li>)}</ul> }`,
      ),
    ).toEqual(['prefer-key-in-list'])
    expect(
      ids(
        `export function C() { let xs: { n: number }[] = []\nreturn <ul onClick={() => (xs = [])}>{xs.map((x) => <li>{x.n}</li>)}</ul> }`,
      ),
    ).toEqual(['prefer-key-in-list'])
  })
  test('shape desconhecido (await, store, chamada, tipo nomeado) não avisa', () => {
    expect(
      ids(`export async function C() { const xs = await api.list()\nreturn <ul>{xs.map((x: any) => <li>{x.n}</li>)}</ul> }
declare const api: any`),
    ).toEqual([])
    expect(
      ids(
        `import { cart } from './cart'\nexport function C() { return <ul>{cart.items.map((x) => <li>{x.n}</li>)}</ul> }`,
      ),
    ).toEqual([])
    expect(
      ids(`export function C() { let xs: any[] = []\nreturn <ul onClick={async () => (xs = await load())}>{xs.map((x) => <li>{x.n}</li>)}</ul> }
declare function load(): Promise<any[]>`),
    ).toEqual([])
    expect(
      ids(`export function C() { let xs: Todo[] = []\nreturn <ul onClick={() => (xs = [])}>{xs.map((x) => <li>{x.n}</li>)}</ul> }
interface Todo { n: number }`),
    ).toEqual([])
  })
  test('literal com id não avisa', () => {
    expect(
      ids(
        `export function C() { let xs = [{ id: 1, n: 1 }]\nreturn <ul onClick={() => (xs = [])}>{xs.map((x) => <li>{x.n}</li>)}</ul> }`,
      ),
    ).toEqual([])
  })
})

describe('await (W-5): hoisting suportado, outras posições não', () => {
  const ids = (src: string, file = 'x.tsx') => run(src, file).diagnostics.map((d) => d.id)
  const tail = '\ndeclare const api: any'
  test('`const x = f(await e)` e `(await e).y` são suportados (FlowNode.hoisted)', () => {
    const src = `export async function C({ id }: any) {
  const n = (await api.posts(id)).length
  const u = await api.user(id)
  const s = String(await api.count(id))
  return <p>{n}{u.name}{s}</p>
}${tail}`
    expect(ids(src)).not.toContain('await-position-unsupported')
    const flow = body(run(src, 'x.tsx'), 'C').flow.filter((f) => f.kind === 'await')
    expect(flow.map((f) => f.kind === 'await' && f.hoisted)).toEqual([true, false, true])
    expect(kinds(body(run(src, 'x.tsx'), 'C'))).toEqual({ n: 'resource', u: 'resource', s: 'resource' })
  })
  test('posições não cobertas', () => {
    const bad = (s: string) =>
      expect(ids(`export async function C({ id, c }: any) {\n${s}\n}${tail}`)).toContain('await-position-unsupported')
    bad('return <p>{await api.x(id)}</p>')
    bad('let n = (await api.x(id)).length\nreturn <p>{n}</p>')
    bad('const { a } = (await api.x(id)).data\nreturn <p>{a}</p>')
    bad('const a = c ? await api.x(id) : null\nreturn <p>{a}</p>')
    bad('const a = c && (await api.x(id))\nreturn <p>{a}</p>')
    bad('const a = await api.x(id), b = await api.y(id)\nreturn <p>{a}{b}</p>')
    bad('log(await api.x(id))\nreturn <p />')
    bad('if (await api.x(id)) return <i />\nreturn <p />')
    bad('for await (const x of api.s()) log(x)\nreturn <p />')
  })
  test('await em callback não é do corpo; await em use* é await-in-use-unsupported', () => {
    expect(
      ids(`export function C() { const f = async () => { await api.x() }\nreturn <p onClick={f} /> }${tail}`),
    ).toEqual([])
    expect(ids(`export async function useA() { await api.x()\nreturn {} }${tail}`, 'a.ts')).toEqual([
      'await-in-use-unsupported',
    ])
  })
})

describe('use* (U-1) e pending/refresh', () => {
  const ids = (src: string, file = 'a.ts') => run(src, file).diagnostics.map((d) => d.id)
  test('escrita em parâmetro (inclusive desestruturado e update)', () => {
    expect(ids(`export function useA(n: number) { const inc = () => n++\nreturn { inc } }`)).toEqual([
      'use-param-assignment',
    ])
    expect(ids(`export function useA({ a }: any) { const f = () => { a = 1 }\nreturn { f } }`)).toEqual([
      'use-param-assignment',
    ])
    expect(ids(`export function useA(o: any) { const f = () => { o.a = 1 }\nreturn { f } }`)).toEqual([])
  })
  test('spread em chamada de use* só em corpo reativo', () => {
    expect(
      ids(
        `export function useA(xs: any[]) { const r = useB(...xs)\nreturn { r } }\ndeclare function useB(...a: any[]): any`,
      ),
    ).toEqual(['use-spread-args-unsupported'])
    expect(
      ids(
        `export function useA(xs: any[]) { const r = useB(xs)\nreturn { r } }\ndeclare function useB(...a: any[]): any`,
      ),
    ).toEqual([])
  })
  test('pending/refresh de recurso (inclusive desestruturado e içado) não é erro', () => {
    expect(
      ids(
        `import { pending, refresh } from 'jotastic'
export async function C({ id }: any) {
  const u = await api.u(id)
  const [a, b] = await Promise.all([api.a(), api.b()])
  const n = (await api.n()).length
  return <p class={{ x: pending(u) || pending(a) || pending(n) }} onClick={() => refresh(b)}>{u}{a}{b}{n}</p>
}
declare const api: any`,
        'x.tsx',
      ).filter((id) => id !== 'await-waterfall'),
    ).toEqual([])
  })
  test('refresh de valor comum é erro; pending de outra lib não', () => {
    expect(
      ids(
        `import { refresh } from 'jotastic'\nexport function C({ u }: any) { return <p onClick={() => refresh(u)} /> }`,
        'x.tsx',
      ),
    ).toEqual(['pending-not-resource'])
    expect(
      ids(`import { pending } from './x'\nexport function C({ u }: any) { return <p>{pending(u)}</p> }`, 'x.tsx'),
    ).toEqual([])
  })
})

describe('slot-mixed-branch', () => {
  test('ternário Slot × Slot ou Slot × null não gera dica', () => {
    expect(
      run(
        `import { Slot } from 'jotastic'
export function P({ a }: any) { return <Card>{a ? <Slot name="x">1</Slot> : <Slot name="y">2</Slot>}{a ? <Slot name="z" /> : undefined}</Card> }`,
        'x.tsx',
      ).diagnostics,
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
    '05-styling.tsx',
    '06-async.tsx',
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
  test('06-async.tsx não avisa continuation-state-resets nem prefer-key-in-list', () => {
    const ids = run(ex('06-async.tsx'), '06-async.tsx').diagnostics.map((d) => d.id)
    expect(ids).not.toContain('continuation-state-resets')
    expect(ids).not.toContain('prefer-key-in-list')
  })
  test('11-tabs-context.tsx não avisa state-read-in-setup (`tabs.register(id)`)', () => {
    const ids = run(ex('11-tabs-context.tsx'), '11-tabs-context.tsx').diagnostics.map((d) => d.id)
    expect(ids).not.toContain('state-read-in-setup')
  })
})
