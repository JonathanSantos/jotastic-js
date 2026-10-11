// Comportamento das regras da parte 1 executadas contra o runtime: two-way, props getters, rest/spread, mergeProps,
// keyed, stateLiteral/memoLiteral, ref, fragmento.
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { load } from '../helpers'

afterEach(cleanup)

type Comp = (props: Record<string, unknown>) => unknown
type Mod = Record<string, Comp> & { app: () => unknown }

const source = `
export function Field({ label, ...rest }: any) {
  return <label>{label}<input {...rest} /></label>
}

export function Badge({ n, children }: any) {
  return <b data-n={n}>{children}</b>
}

export function Form() {
  let text = 'a'
  let agree = false
  let age = 1
  let el: HTMLInputElement | undefined
  let renders = 0
  const cart = { items: [1, 2], get total() { return this.items.reduce((a, b) => a + b, 0) } }
  const extra = { title: 'extra' }
  function add() { cart.items.push(10) }
  return (
    <div>
      <input ref={el} class="t" value={text} />
      <input type="checkbox" checked={agree} />
      <input type="number" value={age} />
      <p>{text}|{String(agree)}|{age}|{cart.total}|{el ? 'ref' : 'sem'}</p>
      <Badge n={age}>texto {text}</Badge>
      <Field label="L" id="f" {...extra} />
      <Badge key={agree} n={0}>{(renders += 1)}</Badge>
      <button onClick={add}>+</button>
    </div>
  )
}

export const app = () => <><Form /><i>fim</i></>
`

describe('regras compiladas', () => {
  test('two-way, props dinâmicas, rest/spread, keyed, memoLiteral, ref, fragmento', async () => {
    const mod = await load<Mod>(source, 'Form.tsx')
    const { container } = render(mod.app())
    const [text, check, num] = Array.from(container.querySelectorAll('div > input')) as HTMLInputElement[]
    const p = container.querySelector('p')!
    const badges = container.querySelectorAll('b')
    expect(container.lastElementChild!.outerHTML).toBe('<i>fim</i>')
    expect(p.textContent).toBe('a|false|1|3|ref')
    expect(text!.value).toBe('a')
    expect(text!.className).toBe('t')
    expect(badges[0]!.getAttribute('data-n')).toBe('1')
    expect(badges[0]!.textContent).toBe('texto a')
    const field = container.querySelector('label input') as HTMLInputElement
    expect(field.id).toBe('f')
    expect(field.getAttribute('title')).toBe('extra')
    expect(container.querySelector('label')!.firstChild!.textContent).toBe('L')

    await tick()
    resetCounts()
    text!.value = 'ab'
    text!.dispatchEvent(new Event('input'))
    await tick()
    expect(p.textContent).toBe('ab|false|1|3|ref')
    expect(badges[0]!.textContent).toBe('texto ab')
    // texto em <p> + texto do children do Badge (o prop value do input não reescreve: o valor já é igual)
    expect(counts().effects).toBe(3)

    check!.checked = true
    check!.dispatchEvent(new Event('change'))
    num!.value = '7'
    num!.dispatchEvent(new Event('input'))
    await tick()
    expect(p.textContent).toBe('ab|true|7|3|ref')
    expect(badges[0]!.getAttribute('data-n')).toBe('7')
    // keyed: `key={agree}` mudou → Badge recriado (renders 1 → 2)
    expect(container.querySelectorAll('b')[1]!.textContent).toBe('2')

    container.querySelector('button')!.click()
    await tick()
    expect(p.textContent).toBe('ab|true|7|13|ref')
  })
})
