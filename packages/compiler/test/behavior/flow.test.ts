// Comportamento das regras de fluxo compiladas (18 §7–§9): condicionais, listas (índice vivo, chave, mini-corpo do
// item) e early return (setup roda uma vez, continuação recriada com estado novo, casos fundidos).
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, tick } from '@jotastic/test'
import { component, reactive, type Rendered } from 'jotastic/runtime'
import { compile } from '../../src/index'
import { load } from '../helpers'

afterEach(cleanup)

type Comp = (props: Record<string, unknown>) => Rendered

async function mount(code: string, name: string, props: Record<string, unknown> = {}) {
  const mod = await load<Record<string, Comp>>(code, `${name}.tsx`)
  const { container } = render(() => component(mod[name]!, props))
  return container
}

describe('condicionais', () => {
  test('&&, ternário e ||: só o caso ativo no DOM; texto do caso continua vivo', async () => {
    const p = reactive({ n: 0, name: '' as string })
    const c = await mount(
      `export function C(props: { n: number; name: string }) {
        return <div>{props.n > 0 && <b>{props.n}</b>}{props.n > 1 ? <i>muitos</i> : <u>poucos</u>}{props.name || <s>anon</s>}</div>
      }`,
      'C',
      p,
    )
    const div = c.querySelector('div')!
    expect(div.textContent).toBe('poucosanon')
    expect(div.querySelector('b')).toBeNull()
    p.n = 1
    await tick()
    const b = div.querySelector('b')!
    expect(b.textContent).toBe('1')
    p.n = 2
    await tick()
    expect(div.querySelector('b')).toBe(b) // mesmo caso: nada recriado
    expect(b.textContent).toBe('2')
    expect(div.querySelector('i')!.textContent).toBe('muitos')
    p.name = 'ana'
    await tick()
    expect(div.querySelector('s')).toBeNull()
    expect(div.textContent).toContain('ana')
    p.name = 'bia' // mesmo caso (truthy): o accessor mantém o texto vivo
    await tick()
    expect(div.textContent).toContain('bia')
    expect(div.textContent).not.toContain('ana')
  })
})

describe('listas', () => {
  const LIST = `export function L(props: { items: { id: number; t: string }[] }) {
    return (
      <ul>
        <li>topo</li>
        {props.items.map((it, i) => {
          let open = false
          return <li key={it.id} onClick={() => (open = !open)}>{i + 1}:{it.t}{open && <em>!</em>}</li>
        })}
      </ul>
    )
  }`

  test('chave explícita preserva nós; índice vivo `i()`; `let` do item vira signal', async () => {
    const p = reactive({
      items: [
        { id: 1, t: 'a' },
        { id: 2, t: 'b' },
      ],
    })
    const c = await mount(LIST, 'L', p)
    const lis = () => Array.from(c.querySelectorAll('li')).slice(1)
    expect(lis().map((l) => l.textContent)).toEqual(['1:a', '2:b'])
    const [la, lb] = lis()
    lb!.click()
    await tick()
    expect(lb!.textContent).toBe('2:b!')
    p.items.unshift({ id: 3, t: 'c' })
    await tick()
    expect(lis().map((l) => l.textContent)).toEqual(['1:c', '2:a', '3:b!'])
    expect(lis()[1]).toBe(la)
    expect(lis()[2]).toBe(lb) // estado do item (`open`) preservado
    expect(c.querySelector('li')!.textContent).toBe('topo') // marcador: itens depois do estático
  })

  test('chave explícita: o atributo some da raiz e vira o 5º argumento', () => {
    const out = compile(LIST, { filename: 'L.tsx', dev: false }).code
    expect(out).not.toContain('key')
    expect(out).toMatch(/\(it, i\) => it\.id\)/)
  })
})

describe('early return', () => {
  const PAGE = `export function P(props: { user: { error?: string; data?: { name: string } } }) {
    let setupRuns = 0
    setupRuns++
    ;(globalThis as any).__setup = ((globalThis as any).__setup ?? 0) + 1
    if (props.user.error) return <p class="err">{props.user.error}</p>
    if (!props.user.data) return 'carregando'
    let clicks = 0
    ;(globalThis as any).__cont = ((globalThis as any).__cont ?? 0) + 1
    return <button onClick={() => clicks++}>{props.user.data.name}:{clicks}</button>
  }`

  test('casos e continuação: setup uma vez, continuação recriada com estado inicial', async () => {
    const g = globalThis as { __setup?: number; __cont?: number }
    g.__setup = g.__cont = 0
    const user = reactive<{ error?: string; data?: { name: string } }>({})
    const c = await mount(PAGE, 'P', { user })
    expect(c.textContent).toBe('carregando')
    user.data = { name: 'ana' }
    await tick()
    const btn = c.querySelector('button')!
    expect(btn.textContent).toBe('ana:0')
    btn.click()
    await tick()
    expect(btn.textContent).toBe('ana:1')
    user.data.name = 'bia' // mesmo caso: continuação não é recriada
    await tick()
    expect(btn.textContent).toBe('bia:1')
    expect(g.__cont).toBe(1)
    user.error = 'falhou'
    await tick()
    expect(c.querySelector('p.err')!.textContent).toBe('falhou')
    expect(c.querySelector('button')).toBeNull()
    user.error = undefined
    await tick()
    expect(c.querySelector('button')!.textContent).toBe('bia:0') // continuation-state-resets
    expect(g.__cont).toBe(2)
    expect(g.__setup).toBe(1)
  })

  test('aviso continuation-state-resets para `let` na continuação', () => {
    const r = compile(PAGE, { filename: 'P.tsx' })
    const d = r.diagnostics.filter((x) => x.id === 'continuation-state-resets')
    expect(d.map((x) => x.loc.line)).toEqual([7])
  })

  test('switch', async () => {
    const p = reactive({ k: 'a' })
    const c = await mount(
      `export function S(props: { k: string }) {
        switch (props.k) {
          case 'a': return <i>A</i>
          case 'b':
          case 'c': return <i>BC</i>
          default: return <i>?</i>
        }
      }`,
      'S',
      p,
    )
    expect(c.textContent).toBe('A')
    p.k = 'c'
    await tick()
    expect(c.textContent).toBe('BC')
    p.k = 'z'
    await tick()
    expect(c.textContent).toBe('?')
  })
})

describe('children de componente (K-14, K-11)', () => {
  const CODE = `function Box(props: { children?: unknown }) {
    return <div>{props.children}</div>
  }
  export function K(props: { x: number; items: string[] }) {
    return (
      <>
        <Box>{props.x > 0 && <p>{props.x}</p>}</Box>
        <Box>{props.items.map((i) => <i>{i}</i>)}</Box>
      </>
    )
  }`

  test('K-14: filho único condicional vira `branches`: o caso ativo não é recriado', async () => {
    const p = reactive({ x: 0, items: [] as string[] })
    const c = await mount(CODE, 'K', p)
    const box = c.querySelector('div')!
    expect(box.querySelector('p')).toBeNull()
    p.x = 1
    await tick()
    const el = box.querySelector('p')!
    expect(el.textContent).toBe('1')
    p.x = 2
    await tick()
    expect(box.querySelector('p')).toBe(el) // mesmo caso: só o texto muda
    expect(el.textContent).toBe('2')
    p.x = 0
    await tick()
    expect(box.querySelector('p')).toBeNull()
  })

  test('K-11: lista fora de filho de elemento continua accessor comum (recria os itens, mas atualiza)', async () => {
    const p = reactive({ x: 0, items: ['a'] })
    const c = await mount(CODE, 'K', p)
    const box = c.querySelectorAll('div')[1]!
    expect(box.textContent).toBe('a')
    p.items.push('b')
    await tick()
    expect(Array.from(box.querySelectorAll('i')).map((i) => i.textContent)).toEqual(['a', 'b'])
    expect(compile(CODE, { filename: 'K.tsx' }).code).not.toMatch(/\blist\(/)
  })
})
