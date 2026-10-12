import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { App, products } from '../src/App'
import { cart } from '../src/store'

afterEach(() => {
  cleanup()
  cart.$reset()
})

const [cafe, pao, bolo] = products as [(typeof products)[0], (typeof products)[0], (typeof products)[0]]
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const flushMutations = () => new Promise((r) => setTimeout(r))

function setup() {
  const { container } = render(<App />)
  const badge = container.querySelector('.badge')!
  const lines = () => [...container.querySelectorAll('aside li')]
  const card = (name: string) =>
    [...container.querySelectorAll('article')].find((a) => a.querySelector('h3')!.textContent === name)!
  const text = (sel: string) => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ')
  return { container, badge, lines, card, text }
}

describe('examples/cart', () => {
  it('começa vazio', () => {
    const { container, badge, card } = setup()
    expect(badge.textContent).toBe('0')
    expect(badge.classList.contains('empty')).toBe(true)
    expect(container.querySelector('aside')).toBeNull()
    expect(container.textContent).toContain('Seu carrinho está vazio.')
    expect(card('Café').querySelector('button')!.textContent).toBe('Adicionar ')
  })

  it('adicionar pelo botão do produto atualiza badge, resumo e contador do card', async () => {
    const { container, badge, lines, card } = setup()
    card('Café').querySelector('button')!.click()
    card('Café').querySelector('button')!.click()
    card('Pão de queijo').querySelector('button')!.click()
    await tick()
    expect(badge.textContent).toBe('3')
    expect(badge.classList.contains('empty')).toBe(false)
    expect(lines()).toHaveLength(2)
    expect(card('Café').querySelector('button')!.textContent).toBe('Adicionar (2)')
    const total = 2 * cafe.price + pao.price
    expect(container.querySelector('aside strong')!.textContent).toBe(`Total: ${money(total)}`)
  })

  it('cart.add → só count/total/linha nova (19 §Compilador)', async () => {
    const { container, lines, card } = setup()
    cart.add(cafe)
    await tick()
    const [first] = lines()
    const others = [card('Café'), card('Bolo de fubá')].map((a) => a.querySelector('button')!.textContent)

    const touched = new Set<Node>()
    const added: Node[] = []
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        touched.add(r.target.nodeType === 3 ? r.target.parentNode! : r.target)
        if (r.target.nodeName === 'UL') added.push(...r.addedNodes)
      }
    })
    mo.observe(container, { subtree: true, childList: true, characterData: true, attributes: true })
    resetCounts()
    cart.add(pao) // D61: o DOM atualiza no microtask
    await flushMutations()
    mo.disconnect()
    const c = counts()

    expect(lines()).toHaveLength(2)
    expect(lines()[0]!.isSameNode(first!)).toBe(true)
    expect(added).toEqual([lines()[1]])
    // Nós de texto tocados: badge (count), subtotal, total e o "(1)" do card do produto adicionado.
    const touchedText = [...touched].filter((n) => n.nodeName !== 'UL').map((n) => (n as Element).textContent)
    expect(touchedText.sort()).toEqual(
      [
        '2',
        `Subtotal: ${money(cafe.price + pao.price)}`,
        `Total: ${money(cafe.price + pao.price)}`,
        'Adicionar (1)',
      ].sort(),
    )
    expect([card('Café'), card('Bolo de fubá')].map((a) => a.querySelector('button')!.textContent)).toEqual(others)
    // count, "(1)" do card, subtotal, total e a linha nova (texto do nome + value do input + inserção do <li>)
    expect(c.writes).toBe(7)
  })

  it('quantidade, remover e esvaziar', async () => {
    const { container, badge, lines } = setup()
    cart.add(cafe)
    cart.add(bolo)
    await tick()
    const qty = lines()[0]!.querySelector<HTMLInputElement>('input')!
    qty.value = '3'
    qty.dispatchEvent(new Event('change'))
    await tick()
    expect(badge.textContent).toBe('4')
    expect(qty.value).toBe('3')

    lines()[1]!.querySelector('button')!.click()
    await tick()
    expect(lines()).toHaveLength(1)

    qty.value = '0'
    qty.dispatchEvent(new Event('change'))
    await tick()
    expect(container.textContent).toContain('Seu carrinho está vazio.')

    cart.add(pao)
    await tick()
    ;[...container.querySelectorAll('aside > button')].at(-1)!.dispatchEvent(new Event('click'))
    await tick()
    expect(badge.textContent).toBe('0')
    expect(container.querySelector('aside')).toBeNull()
  })

  it('cupom: inválido mostra erro; válido aplica 10%', async () => {
    const { container } = setup()
    cart.add(bolo)
    await tick()
    const input = container.querySelector<HTMLInputElement>('aside form input')!
    const form = container.querySelector('aside form')!
    const submit = async (code: string) => {
      input.value = code
      input.dispatchEvent(new Event('input'))
      form.dispatchEvent(new Event('submit', { cancelable: true }))
      await new Promise((r) => setTimeout(r, 80))
      await tick()
    }
    await submit('nada')
    expect(container.querySelector('.error')!.textContent).toBe('Cupom inválido')
    await submit('JOTA10')
    expect(container.querySelector('.error')).toBeNull()
    expect(container.textContent).toContain('Cupom JOTA10: -10%')
    expect(container.querySelector('aside strong')!.textContent).toBe(`Total: ${money(bolo.price * 0.9)}`)
  })
})
