// @vitest-environment node
import * as t from '@babel/types'
import { describe, expect, test } from 'vitest'
import type { FlowNode } from '../src/index'
import { body, run } from './helpers'

const flowOf = (src: string, name = 'C') => body(run(src), name).flow
const shape = (flow: FlowNode[]) =>
  flow.map((f) => (f.kind === 'return' ? `return#${f.branchIndex}` : f.kind === 'await' ? 'await' : 'final'))

describe('early return (18 §9)', () => {
  test('if/return + final', () => {
    const flow = flowOf(`function C({ a }: any) {
  const x = 1
  if (a) return <A />
  return <B />
}`)
    expect(shape(flow)).toEqual(['return#0', 'final'])
    const r = flow[0] as Extract<FlowNode, { kind: 'return' }>
    expect(t.isIdentifier(r.cond, { name: 'a' })).toBe(true)
    expect(r.prelude).toEqual([])
    expect(r.node.type).toBe('ReturnStatement')
  })

  test('ifs consecutivos (UserPage) e estado da continuação', () => {
    const b = body(
      run(`function C({ u }: any) {
  if (u.error) return <E />
  if (!u.data) return <S />
  let tab = 'posts'
  return <div>{tab}</div>
}`),
      'C',
    )
    expect(shape(b.flow)).toEqual(['return#0', 'return#0', 'final'])
    expect(b.bindings.get('tab')!.flowIndex).toBe(1)
  })

  test('else if / else', () => {
    const flow = flowOf(`function C({ s }: any) {
  if (s === 'a') return <A />
  else if (s === 'b') return <B />
  else return <D />
}`)
    expect(shape(flow)).toEqual(['return#0', 'return#1', 'final'])
  })

  test('else if seguido de continuação', () => {
    const b = body(
      run(`function C({ s }: any) {
  if (s === 'a') { return <A /> } else if (s === 'b') { return <B /> }
  const z = s + 1
  return <p>{z}</p>
}`),
      'C',
    )
    expect(shape(b.flow)).toEqual(['return#0', 'return#1', 'final'])
    expect(b.bindings.get('z')!.flowIndex).toBe(1)
  })

  test('prelude: statements do bloco antes do return', () => {
    const flow = flowOf(`function C({ a }: any) {
  if (a) {
    console.log('x')
    const y = 2
    return <A y={y} />
  }
  return <B />
}`)
    const r = flow[0] as Extract<FlowNode, { kind: 'return' }>
    expect(r.prelude.map((n) => n.type)).toEqual(['ExpressionStatement', 'VariableDeclaration'])
  })

  test('switch com return em cada case; fallthrough vira ||; default é o fallback', () => {
    const flow = flowOf(`function C({ s }: any) {
  switch (s) {
    case 'a':
    case 'b':
      return <AB />
    case 'c': {
      console.log(1)
      return <Cc />
    }
    default:
      return <D />
  }
}`)
    expect(shape(flow)).toEqual(['return#0', 'return#1', 'final'])
    const [ab, c] = flow as Array<Extract<FlowNode, { kind: 'return' }>>
    expect(t.isLogicalExpression(ab.cond, { operator: '||' })).toBe(true)
    expect(t.isBinaryExpression(c.cond, { operator: '===' })).toBe(true)
    expect(c.prelude).toHaveLength(1)
  })

  test('return de não-JSX é permitido', () => {
    expect(shape(flowOf(`function C({ a }: any) { if (!a) return null\nreturn <p /> }`))).toEqual(['return#0', 'final'])
  })

  test('use*: if/return é JS normal (só o return final)', () => {
    const b = body(run(`export function useA(x: number) { if (x) return { a: 1 }\nreturn { a: 2 } }`, 'a.ts'), 'useA')
    expect(shape(b.flow)).toEqual(['final'])
  })
})

describe('await (18 §10)', () => {
  test('await encadeado: declaradores, reads e flowIndex', () => {
    const b = body(
      run(`async function C({ id }: any) {
  let q = ''
  const user = await api.user(id)
  const posts = await api.posts(user.id, q)
  let only = false
  return <p>{q}{posts.length}{only}</p>
}`),
      'C',
    )
    expect(shape(b.flow)).toEqual(['await', 'await', 'final'])
    const [a1, a2] = b.flow as Array<Extract<FlowNode, { kind: 'await' }>>
    expect(a1.declarator!.id).toMatchObject({ name: 'user' })
    expect([...a1.reads]).toEqual(['id'])
    expect([...a2.reads].sort()).toEqual(['q', 'user'])
    expect(b.bindings.get('q')!.flowIndex).toBe(-1)
    expect(b.bindings.get('user')!.flowIndex).toBe(-1)
    expect(b.bindings.get('posts')!.flowIndex).toBe(0)
    expect(b.bindings.get('only')!.flowIndex).toBe(1)
    expect(b.isAsync).toBe(true)
  })

  test('await sem declarador', () => {
    const flow = flowOf(`async function C() { await sleep(1)\nreturn <p /> }`)
    expect(shape(flow)).toEqual(['await', 'final'])
    expect((flow[0] as Extract<FlowNode, { kind: 'await' }>).declarator).toBeUndefined()
  })

  test('early return depois de await fica na continuação', () => {
    const b = body(
      run(`async function C({ id }: any) {
  const user = await api.user(id)
  if (!user) return <Empty />
  const name = user.name
  return <p>{name}</p>
}`),
      'C',
    )
    expect(shape(b.flow)).toEqual(['await', 'return#0', 'final'])
    expect(b.bindings.get('name')!.flowIndex).toBe(1)
  })

  test('await dentro de callback não é ponto de decisão', () => {
    expect(shape(flowOf(`function C() { const f = async () => { await x() }\nreturn <p onClick={f} /> }`))).toEqual([
      'final',
    ])
  })
})

describe('erros de fluxo', () => {
  const ids = (src: string) => run(src).diagnostics.map((d) => d.id)

  test('return dentro de for / while / try', () => {
    expect(ids(`function C({ xs }: any) { for (const x of xs) { if (x) return <A /> }\nreturn <B /> }`)).toContain(
      'return-in-loop-or-try',
    )
    expect(ids(`function C({ a }: any) { while (a) { return <A /> }\nreturn <B /> }`)).toContain(
      'return-in-loop-or-try',
    )
    expect(ids(`function C() { try { return <A /> } catch { return <B /> } }`)).toContain('return-in-loop-or-try')
  })

  test('return em loop dentro de callback não é erro', () => {
    expect(
      ids(`function C({ xs }: any) { const f = () => { for (const x of xs) return x }\nreturn <p>{f()}</p> }`),
    ).not.toContain('return-in-loop-or-try')
  })

  test('await em try / await em if sem return', () => {
    expect(ids(`async function C() { try { const x = await f() } catch {}\nreturn <p /> }`)).toContain('await-in-try')
    expect(ids(`async function C({ a }: any) { if (a) { await f() }\nreturn <p /> }`)).toContain('await-in-branch')
  })

  test('use*: return em loop é JS normal', () => {
    expect(
      run(`export function useA(xs: number[]) { for (const x of xs) return { x }\nreturn {} }`, 'a.ts').diagnostics,
    ).toEqual([])
  })
})
