import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, tick } from '@jotastic/test'
import { App } from '../src/App'

afterEach(cleanup)

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

describe('examples/slots', () => {
  it('slot padrão, nomeado e com parâmetro', async () => {
    const { container } = render(<App />)
    const header = container.querySelector('.table header')!
    expect(header.querySelector('h2')!.textContent).toBe('Produtos')
    expect(button(header, 'Limpar seleção')).toBeDefined()
    const rows = () => [...container.querySelectorAll('.table li button')].map((b) => b.textContent)
    expect(rows()).toEqual(['Monitor — R$ 1200', 'Mouse — R$ 90', 'Teclado — R$ 250'])

    const select = header.querySelector('select')!
    select.value = 'price'
    select.dispatchEvent(new Event('change'))
    await tick()
    expect(rows()).toEqual(['Mouse — R$ 90', 'Teclado — R$ 250', 'Monitor — R$ 1200'])
  })

  it('slot com parâmetro mantém estado do pai (seleção)', async () => {
    const { container } = render(<App />)
    const mouse = button(container, 'Mouse — R$ 90')
    mouse.click()
    await tick()
    expect(mouse.classList.contains('selected')).toBe(true)
    button(container, 'Limpar seleção').click()
    await tick()
    expect(mouse.classList.contains('selected')).toBe(false)
  })

  it('slot condicional (footer) e slot empty', async () => {
    const { container } = render(<App />)
    expect(container.querySelector('.table footer')).toBeNull()
    const admin = container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    admin.click()
    await tick()
    expect(container.querySelector('.table footer')!.textContent).toBe('Exportar CSV')

    button(container, 'Adicionar produto').click()
    await tick()
    expect(container.querySelectorAll('.table li')).toHaveLength(4)

    button(container, 'Remover todos').click()
    await tick()
    expect(container.querySelector('.table')).toBeNull()
    expect(container.querySelector('.empty')!.textContent).toBe('Nenhum produto cadastrado.')
  })
})
