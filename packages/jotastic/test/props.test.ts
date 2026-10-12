import { describe, expect, test } from 'vitest'
import {
  createContext,
  createOwner,
  dispose,
  effect,
  flush,
  memo,
  mergeProps,
  provide,
  rest,
  runWithOwner,
  signal,
  useContext,
} from '../src/runtime/index'

describe('rest', () => {
  test('encaminha getters, exclui chaves e ownKeys reflete as props atuais', () => {
    const size = signal(32)
    const props: Record<string, unknown> = {
      user: 'u',
      get size() {
        return size.get()
      },
      title: 't',
    }
    const r = rest(props, ['user']) as Record<string, unknown>
    expect(r.user).toBeUndefined()
    expect('user' in r).toBe(false)
    expect(r.size).toBe(32)
    size.set(64)
    expect(r.size).toBe(64)
    expect(Object.keys(r)).toEqual(['size', 'title'])
    props.extra = 1
    expect(Object.keys(r)).toEqual(['size', 'title', 'extra'])
    expect({ ...r }).toEqual({ size: 64, title: 't', extra: 1 })
  })

  test('leitura via rest é reativa (getter preservado)', () => {
    const size = signal(1)
    const props = {
      a: 0,
      get size() {
        return size.get()
      },
    }
    const r = rest(props, ['a'])
    const seen: number[] = []
    runWithOwner(createOwner('root', null), () => effect(() => void seen.push(r.size), { kind: 'render' }))
    size.set(2)
    flush()
    expect(seen).toEqual([1, 2])
  })

  test('descritor expõe setter só quando a origem tem setter', () => {
    let v = 'x'
    const props = {
      get value() {
        return v
      },
      set value(n: string) {
        v = n
      },
      plain: 1,
    }
    const r = rest(props, []) as Record<string, unknown>
    expect(Object.getOwnPropertyDescriptor(r, 'value')?.set).toBeTypeOf('function')
    expect(Object.getOwnPropertyDescriptor(r, 'plain')?.set).toBeUndefined()
    r.value = 'y'
    expect(v).toBe('y')
  })
})

describe('mergeProps', () => {
  test('última fonte vence; getters preservados; ownKeys é a união', () => {
    const b = signal('b1')
    const m = mergeProps(
      { a: 1, x: 'first' },
      { x: 1 },
      {
        get b() {
          return b.get()
        },
      },
    )
    expect(m.x).toBe(1)
    expect(m.a).toBe(1)
    expect(m.b).toBe('b1')
    b.set('b2')
    expect(m.b).toBe('b2')
    expect(Object.keys(m).sort()).toEqual(['a', 'b', 'x'])
    expect('a' in m).toBe(true)
    expect('zz' in m).toBe(false)
  })

  test('fontes função são reavaliadas a cada leitura', () => {
    const spread = signal<Record<string, unknown>>({ a: 1 })
    const m = mergeProps({ a: 0, b: 0 }, () => spread.get())
    expect(m.a).toBe(1)
    expect(Object.keys(m).sort()).toEqual(['a', 'b'])
    spread.set({ b: 2, c: 3 })
    expect(m.a).toBe(0)
    expect(m.b).toBe(2)
    expect(Object.keys(m).sort()).toEqual(['a', 'b', 'c'])
  })

  test('mergeProps sobre rest funciona (proxy sobre proxy)', () => {
    const props = { a: 1, b: 2 }
    const m = mergeProps(rest(props, ['a']), { c: 3 })
    expect({ ...m }).toEqual({ b: 2, c: 3 })
  })
})

describe('contexto', () => {
  test('useContext sobe a cadeia de owners; Provider mais próximo vence', () => {
    const Ctx = createContext<string>()
    const root = createOwner('root', null)
    runWithOwner(root, () => provide(Ctx, () => 'root'))
    const child = createOwner('component', root)
    const grand = createOwner('component', child)
    expect(runWithOwner(grand, () => useContext(Ctx))).toBe('root')
    runWithOwner(child, () => provide(Ctx, () => 'child'))
    expect(runWithOwner(grand, () => useContext(Ctx))).toBe('child')
    expect(runWithOwner(root, () => useContext(Ctx))).toBe('root')
  })

  test('sem Provider usa defaultValue; sem nenhum → erro em dev', () => {
    const WithDefault = createContext('dark')
    const NoDefault = createContext<number>()
    const root = createOwner('root', null)
    expect(runWithOwner(root, () => useContext(WithDefault))).toBe('dark')
    expect(() => runWithOwner(root, () => useContext(NoDefault))).toThrow(/context-missing/)
  })

  test('I-3: provide guarda um memo do getter; useContext lido num contexto rastreado acompanha', () => {
    const Ctx = createContext<string>()
    const theme = signal('claro')
    const root = createOwner('root', null)
    const seen: string[] = []
    let calls = 0
    runWithOwner(root, () => {
      provide(Ctx, () => (calls++, theme.get()))
      const comp = createOwner('component', root)
      runWithOwner(comp, () => {
        const value = memo(() => useContext(Ctx))
        effect(() => void seen.push(value.get()), { kind: 'render' })
      })
    })
    expect(seen).toEqual(['claro'])
    theme.set('escuro')
    flush()
    expect(seen).toEqual(['claro', 'escuro'])
    expect(calls).toBe(2)
    dispose(root)
  })

  test('provide fora de owner → erro em dev', () => {
    const Ctx = createContext(1)
    expect(() => provide(Ctx, () => 2)).toThrow(/use-outside-owner/)
  })
})
