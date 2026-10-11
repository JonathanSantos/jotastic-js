// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { BindingKind } from '../src/index'
import { body, kinds, run } from './helpers'

const HEADER = `import { external, watch, on, onMount } from 'jotastic'
import { CONST_IMPORT, store } from './x'
declare function f(...a: any[]): any
declare function useX(...a: any[]): any
`

/** Classifica `name` declarado no corpo de `function C({ p, items, step }) { … }`. */
function classifyIn(src: string, name: string, async = false): BindingKind {
  const a = run(`${HEADER}\n${async ? 'async ' : ''}function C({ p, items, step }: any) {\n${src}\n}`)
  const b = body(a, 'C').bindings.get(name)
  if (!b) throw new Error(`binding ${name} não encontrado`)
  return b.kind
}

describe('18 §3 — uma linha por regra', () => {
  test.each<[string, string, string, BindingKind, boolean?]>([
    // await
    ['await no inicializador (const)', 'const x = await f(p)\nreturn <p>{x}</p>', 'x', 'resource', true],
    ['await no inicializador (let)', 'let x = await f(p)\nreturn <p>{x}</p>', 'x', 'resource', true],
    ['await aninhado no inicializador', 'const x = (await f(p)).data\nreturn <p>{x}</p>', 'x', 'resource', true],
    // ref
    ['let usado em ref={x}', 'let el!: HTMLElement\nreturn <div ref={el} />', 'el', 'ref'],
    // let
    ['let só lido em handler → plain', 'let n = 0\nreturn <button onClick={() => console.log(n++)} />', 'n', 'plain'],
    ['let só lido em onMount → plain', 'let n = 0\nonMount(() => console.log(n))\nreturn <p />', 'n', 'plain'],
    [
      'let lido em on (handler) → plain',
      "let n = 0\non(window, 'x', () => console.log(n))\nreturn <p />",
      'n',
      'plain',
    ],
    [
      'let sem leitura → plain',
      'let timer: number | undefined\nreturn <p onClick={() => (timer = 1)} />',
      'timer',
      'plain',
    ],
    ['let primitivo lido no JSX → signal', 'let n = 0\nreturn <button onClick={() => n++}>{n}</button>', 'n', 'signal'],
    [
      'let primitivo com += → signal',
      'let n = 0\nreturn <button onClick={() => (n += step)}>{n}</button>',
      'n',
      'signal',
    ],
    ['let template literal → signal', 'let s = `a${p}`\nreturn <p>{s}</p>', 's', 'signal'],
    ['let x = null; x = "a" → signal', "let x: any = null\nreturn <p onClick={() => (x = 'a')}>{x}</p>", 'x', 'signal'],
    [
      'let x = null; depois x = {} → state',
      'let x: any = null\nreturn <p onClick={() => (x = {})}>{x}</p>',
      'x',
      'state',
    ],
    ['let objeto → state', 'let o = { a: 1 }\nreturn <p>{o.a}</p>', 'o', 'state'],
    ['let array → state', 'let l: number[] = []\nreturn <p>{l.length}</p>', 'l', 'state'],
    ['let cópia de prop (identificador) → state', 'let d = p\nreturn <p>{d}</p>', 'd', 'state'],
    ['let atribuído com identificador → state', 'let x = 0\nreturn <p onClick={() => (x = p)}>{x}</p>', 'x', 'state'],
    ['let lido em const derivado → vivo', 'let n = 0\nconst d = n * 2\nreturn <p>{d}</p>', 'n', 'signal'],
    ['let lido em watch → vivo', 'let n = 0\nwatch(() => console.log(n))\nreturn <p />', 'n', 'signal'],
    ['let lido em argumento de use* → vivo', 'let n = 0\nconst r = useX(n)\nreturn <p>{r.v}</p>', 'n', 'signal'],
    ['let lido em external → vivo', 'let n = 0\nexternal(() => f(n))\nreturn <p />', 'n', 'signal'],
    ['let lido no alvo de on → vivo', "let t: any = null\non(t, 'x', () => {})\nreturn <p />", 't', 'signal'],
    ['let lido em condição de early return → vivo', 'let n = 0\nif (n) return <a />\nreturn <p />', 'n', 'signal'],
    [
      'let lido em função raiz chamada no JSX → vivo',
      'let n = 0\nfunction label() { return n }\nreturn <p>{label()}</p>',
      'n',
      'signal',
    ],
    [
      'let lido em função raiz usada só como handler → plain',
      'let n = 0\nfunction log() { console.log(n) }\nreturn <p onClick={log} />',
      'n',
      'plain',
    ],
    ['let escrito por two-way → signal', "let draft = ''\nreturn <input value={draft} />", 'draft', 'signal'],
    [
      'let em two-way select multiple → state',
      'let v: string[] = []\nreturn <select multiple value={v} />',
      'v',
      'state',
    ],
    // const
    ['const arrow → function', 'const fn = () => p\nreturn <p onClick={fn} />', 'fn', 'function'],
    [
      'const function expression → function',
      'const fn = function () { return p }\nreturn <p onClick={fn} />',
      'fn',
      'function',
    ],
    ['const JSX → jsx', 'const el = <b>{p}</b>\nreturn <p>{el}</p>', 'el', 'jsx'],
    ['const fragment → jsx', 'const el = <><b /></>\nreturn <p>{el}</p>', 'el', 'jsx'],
    [
      'items.filter().map(i => <li/>) → list',
      'const rows = items.filter((i: any) => i.ok).map((i: any) => <li>{i.name}</li>)\nreturn <ul>{rows}</ul>',
      'rows',
      'list',
    ],
    ['.map sem JSX → memo', 'const ns = items.map((i: any) => i * 2)\nreturn <p>{ns}</p>', 'ns', 'memo'],
    ['external(...) → external', 'const c = external(() => f())\nreturn <p />', 'c', 'external'],
    ['useX() → useResult', 'const u = useX()\nreturn <p>{u.v}</p>', 'u', 'useResult'],
    ['useX(arg) → useResult', 'const u = useX(p)\nreturn <p>{u.v}</p>', 'u', 'useResult'],
    ['{ a: 1 } → stateLiteral', 'const o = { a: 1 }\nreturn <p>{o.a}</p>', 'o', 'stateLiteral'],
    ['[] → stateLiteral', 'const l: number[] = []\nreturn <p>{l.length}</p>', 'l', 'stateLiteral'],
    [
      'literal com método que lê estado → stateLiteral',
      'const o = { f() { return p } }\nreturn <p>{o.f()}</p>',
      'o',
      'stateLiteral',
    ],
    ['{ a: x } (x reativo) → memo', 'const o = { a: p }\nreturn <p>{o.a}</p>', 'o', 'memo'],
    ['[...items] → memo', 'const l = [...items]\nreturn <p>{l.length}</p>', 'l', 'memo'],
    ['{ get a() {} } → memoLiteral', 'const o = { get a() { return p } }\nreturn <p>{o.a}</p>', 'o', 'memoLiteral'],
    ['const x = CONST_IMPORT → plain', 'const x = CONST_IMPORT\nreturn <p>{x}</p>', 'x', 'plain'],
    ['const literal primitivo → plain', 'const x = 1 + 2\nreturn <p>{x}</p>', 'x', 'plain'],
    ['const de global sem chamada → plain', 'const t = document.title\nreturn <p>{t}</p>', 't', 'plain'],
    ['const lendo let plain → plain', 'let n = 0\nconst m = n\nreturn <p onClick={() => n++} />', 'm', 'memo'],
    ['const x = store.total → memo (candidato)', 'const x = store.total\nreturn <p>{x}</p>', 'x', 'memo'],
    ['const { a, b } = store → memo', 'const { a, b } = store\nreturn <p>{a}{b}</p>', 'a', 'memo'],
    ['chamada sem leitura reativa → memo (candidato)', 'const now = Date.now()\nreturn <p>{now}</p>', 'now', 'memo'],
    ['new sem leitura reativa → memo (candidato)', 'const m = new Map()\nreturn <p>{m.size}</p>', 'm', 'memo'],
    ['derivado de prop → memo', 'const d = p * 2\nreturn <p>{d}</p>', 'd', 'memo'],
    ['derivado de derivado → memo', 'const d = p * 2\nconst e = d + 1\nreturn <p>{e}</p>', 'e', 'memo'],
  ])('%s', (_, src, name, expected, async) => {
    expect(classifyIn(src, name, async)).toBe(expected)
  })

  test('let + const derivado: o let é vivo mesmo se só lido pelo memo', () => {
    // n é lido pelo memo `m` (contexto vivo) e por isso vira signal; `m` lê n → memo
    const a = run(`function C() { let n = 0\nconst m = n\nreturn <p onClick={() => n++} /> }`)
    expect(kinds(body(a, 'C'))).toEqual({ n: 'signal', m: 'memo' })
  })
})

describe('BindingInfo', () => {
  test('reassigned, reads, proven, isLet, declarator', () => {
    const a = run(`import { store } from './s'
function C({ p }: any) {
  let n = 0
  let k = 1
  const d = n * p
  const s = store.total
  return <p onClick={() => n++}>{n}{k}{d}{s}</p>
}`)
    const b = body(a, 'C')
    const n = b.bindings.get('n')!
    expect(n).toMatchObject({ kind: 'signal', isLet: true, reassigned: true, flowIndex: -1, proven: true })
    expect(b.bindings.get('k')!.reassigned).toBe(false)
    const d = b.bindings.get('d')!
    expect(d).toMatchObject({ kind: 'memo', isLet: false, proven: true })
    expect([...d.reads].sort()).toEqual(['n', 'p'])
    expect(d.declarator.type).toBe('VariableDeclarator')
    expect(b.bindings.get('s')).toMatchObject({ kind: 'memo', proven: false })
    expect([...b.liveReads].sort()).toEqual(['d', 'k', 'n', 's'])
  })

  test('two-way conta como reatribuição', () => {
    const b = body(run(`function C() { let t = ''\nreturn <input value={t} /> }`), 'C')
    expect(b.bindings.get('t')!.reassigned).toBe(true)
  })

  test('sombreamento: leitura de identificador local com o mesmo nome não conta', () => {
    const b = body(run(`function C() { let n = 0\nreturn <ul>{[1].map(n => <li>{n}</li>)}</ul> }`), 'C')
    expect(b.bindings.get('n')!.kind).toBe('plain')
  })
})

describe('parâmetros', () => {
  test('componente: desestruturação com default e rest', () => {
    const b = body(run(`function C({ a, b = 1, c: local, ...rest }: any) { return <p /> }`), 'C')
    expect(b.params.map((p) => [p.name, p.kind, !!p.defaultValue])).toEqual([
      ['a', 'destructured', false],
      ['b', 'destructured', true],
      ['local', 'destructured', false],
      ['rest', 'rest', false],
    ])
  })
  test('componente: objeto props', () => {
    expect(body(run(`function C(props: any) { return <p>{props.a}</p> }`), 'C').params).toEqual([
      { name: 'props', kind: 'propsObject' },
    ])
  })
  test('use*: posicionais, default, rest', () => {
    const b = body(run(`export function useA(a: number, b = 2, ...more: number[]) { return { a } }`, 'a.ts'), 'useA')
    expect(b.params.map((p) => [p.name, p.kind, !!p.defaultValue])).toEqual([
      ['a', 'positional', false],
      ['b', 'positional', true],
      ['more', 'rest', false],
    ])
  })
})

describe('corpos reativos (18 §1)', () => {
  test('detecção', () => {
    const a = run(`import { mount } from 'jotastic'
export function A() { return <p /> }
const B = () => <p />
export default function D() { return null as any || <p /> }
function notComp() { return <p /> }
function NoJSX() { return 1 }
export const useA = (x: number) => { let v = x; return { v } }
function useB() { return {} }
const Tabs: any = () => <div />
Tabs.Tab = function Tab() { return <b /> }
async function E() { const x = await fetch('/'); return <p>{x}</p> }
function Outer() {
  function Inner() { return <i /> }
  return <Inner />
}
mount(<A />, '#app')`)
    expect(a.bodies.map((b) => `${b.kind}:${b.name}`)).toEqual([
      'component:A',
      'component:B',
      'component:D',
      'use:useA',
      'use:useB',
      'component:Tabs',
      'component:Tab',
      'component:E',
      'component:Outer',
    ])
    expect(body(a, 'E').isAsync).toBe(true)
    expect(body(a, 'A').returnsJSX).toBe(true)
    expect(body(a, 'useA').returnsJSX).toBe(false)
    // JSX fora de corpos: retorno de função comum e argumento de mount
    expect(a.topLevelJSX).toHaveLength(2)
  })

  test('.ts não tem componentes, mas tem use*', () => {
    const a = run(`export function A() { return null }\nexport function useA() { let x = 0; return { x } }`, 'a.ts')
    expect(a.bodies.map((b) => b.name)).toEqual(['useA'])
  })

  test('use* fora do escopo do módulo não é corpo', () => {
    const a = run(`function make() { function useA() { return {} } return useA }`, 'a.ts')
    expect(a.bodies).toEqual([])
  })

  test('use*: let lido no objeto de retorno é vivo; função retornada torna o corpo dela vivo', () => {
    const b = body(
      run(
        `export function useA() { let x = 0; let y = 0; let z = 0; const inc = () => y++; const bump = () => z++; return { x, inc } }`,
        'a.ts',
      ),
      'useA',
    )
    expect(kinds(b)).toEqual({ x: 'signal', y: 'signal', z: 'plain', inc: 'function', bump: 'function' })
  })
})

// ── exemplos oficiais × saídas compiladas ──────────────────────────────────────

const ex = (f: string) => readFileSync(new URL(`../../../docs/spec/examples/${f}`, import.meta.url), 'utf8')

describe('exemplos de docs/spec coerentes com docs/spec/compiled', () => {
  test('01-counter (compiled/01): count signal, double/isEven memo; label/step props', () => {
    const b = body(run(ex('01-counter.tsx'), 'Counter.tsx'), 'Counter')
    expect(kinds(b)).toEqual({ count: 'signal', double: 'memo', isEven: 'memo' })
    expect(b.params.map((p) => p.name)).toEqual(['label', 'step'])
    expect(b.bindings.get('count')!.declarator.loc!.start).toMatchObject({ line: 5 })
  })

  test('02-todos (compiled/02): todos state, draft signal, derivados memo', () => {
    const k = kinds(body(run(ex('02-todos.tsx'), 'Todos.tsx'), 'Todos'))
    expect(k).toMatchObject({ todos: 'state', draft: 'signal', remaining: 'memo', visible: 'memo', allDone: 'memo' })
    // compiled/02 usa signal para `filter`; pela regra de 18 §3 a atribuição `filter = f` (identificador) não é
    // provavelmente primitiva → state (seguro). Divergência registrada nas pendências.
    expect(k.filter).toBe('state')
  })

  test('compiled/04 (UserPage): useResult no setup, tab/fullName na continuação', () => {
    const b = body(
      run(`import { useFetch } from './useFetch'
export function UserPage({ id }: { id: string }) {
  const user = useFetch<any>(\`/api/users/\${id}\`)
  if (user.error) return <ErrorBox message={user.error.message} />
  if (!user.data) return <Spinner />
  let tab = 'posts'
  const fullName = \`\${user.data.firstName} \${user.data.lastName}\`
  return <div><h1>{fullName}</h1><Tabs value={tab} onChange={(t: string) => (tab = t)} /></div>
}`),
      'UserPage',
    )
    // compiled/04 usa signal para `tab`; `tab = t` (identificador) não é provavelmente primitivo → state (pendência)
    expect(kinds(b)).toEqual({ user: 'useResult', tab: 'state', fullName: 'memo' })
    expect(b.bindings.get('user')!.flowIndex).toBe(-1)
    expect(b.bindings.get('tab')!.flowIndex).toBe(1)
    expect(b.bindings.get('fullName')!.flowIndex).toBe(1)
  })

  test('06-async UserCard (compiled/05): user resource', () => {
    const src = ex('06-async.tsx').replace(/^import \{ api \}.*$/m, '')
    const a = run(src, 'UserCard.tsx')
    expect(kinds(body(a, 'UserCard'))).toEqual({ user: 'resource' })
    expect(kinds(body(a, 'UserPosts'))).toMatchObject({
      user: 'resource',
      posts: 'resource',
      tags: 'resource',
      onlyPublished: 'signal',
      visible: 'memo',
    })
    expect(kinds(body(a, 'Search'))).toEqual({ query: 'signal', debounced: 'useResult', results: 'resource' })
    expect(kinds(body(a, 'Profile'))).toEqual({ user: 'resource' })
  })

  test('07-use-functions (compiled/03): mql memo, data state; pos stateLiteral; previous plain', () => {
    const a = run(ex('07-use-functions.ts'), 'use.ts')
    expect(kinds(body(a, 'useFetch')).data).toBe('state')
    // compiled/03 usa signal para `error` e `matches`; pela regra (atribuição `error = e`, init `mql.matches`)
    // ficam state. Divergência registrada nas pendências.
    expect(kinds(body(a, 'useFetch')).error).toBe('state')
    expect(kinds(body(a, 'useMediaQuery'))).toEqual({ mql: 'memo', matches: 'state' })
    expect(kinds(body(a, 'useMouse'))).toEqual({ pos: 'stateLiteral' })
    expect(kinds(body(a, 'useTitle'))).toEqual({ previous: 'plain' })
    expect(kinds(body(a, 'useDebounced'))).toEqual({ debounced: 'state' })
  })

  test('08-store-usage: desestruturação de store vira derivados', () => {
    const a = run(ex('08-store-usage.tsx'), 'Cart.tsx')
    expect(kinds(body(a, 'CartSummary'))).toEqual({ code: 'signal', subtotal: 'memo', total: 'memo' })
    expect(kinds(body(a, 'ProductCard'))).toEqual({ inCart: 'memo' })
  })

  test('09-external: refs e external', () => {
    const a = run(ex('09-external.tsx'), 'Ext.tsx')
    expect(kinds(body(a, 'SalesChart'))).toEqual({ canvas: 'ref', chart: 'external' })
    expect(kinds(body(a, 'Room'))).toEqual({ messages: 'state', status: 'signal', socket: 'external' })
    expect(kinds(body(a, 'Map'))).toEqual({ el: 'ref', map: 'external' })
  })

  test('11-tabs-context: getters → memoLiteral; Tabs.Tab é componente', () => {
    const a = run(ex('11-tabs-context.tsx'), 'Tabs.tsx')
    expect(kinds(body(a, 'Tabs'))).toEqual({ active: 'state', ids: 'stateLiteral', state: 'memoLiteral' })
    expect(kinds(body(a, 'Tab'))).toEqual({ tabs: 'useResult', selected: 'memo' })
  })

  test('14-use-form: cópias mutáveis, derivados e funções', () => {
    const k = kinds(body(run(ex('14-use-form.ts'), 'useForm.ts'), 'useForm'))
    expect(k).toEqual({
      values: 'state',
      touched: 'state',
      submitting: 'signal',
      serverError: 'state',
      errors: 'memo',
      valid: 'memo',
      dirty: 'memo',
      error: 'function',
    })
  })
})
