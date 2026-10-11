import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, tick } from '@jotastic/test'
import { DeleteAccount } from '../src/Modal'
import { api } from '../src/api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const modal = () => document.body.querySelector<HTMLElement>('.modal')
const backdrop = () => document.body.querySelector<HTMLElement>('.backdrop')
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

async function open() {
  const { container } = render(<DeleteAccount />)
  button(container, 'Excluir conta').click()
  await tick()
  await tick()
  return container
}

describe('examples/modal', () => {
  it('fechado: nada no DOM', () => {
    const { container } = render(<DeleteAccount />)
    expect(modal()).toBeNull()
    expect(container.textContent).toBe('Excluir conta')
  })

  it('abre via Portal em document.body, com slots e foco no input (tick)', async () => {
    const container = await open()
    const m = modal()!
    expect(m).not.toBeNull()
    expect(container.contains(m)).toBe(false) // Portal: fora do container
    expect(backdrop()!.parentNode).toBe(document.body)
    expect(m.getAttribute('role')).toBe('dialog')
    expect(m.querySelector('h2')!.textContent).toBe('Tem certeza?')
    expect(m.querySelector('.body')!.textContent).toContain('Digite excluir para confirmar.')
    // slot "actions" no rodapé, antes do "Fechar"
    expect([...m.querySelectorAll('footer button')].map((b) => b.textContent)).toEqual([
      'Excluir definitivamente',
      'Fechar',
    ])
    expect(document.activeElement).toBe(m.querySelector('input'))
  })

  it('two-way do input habilita o botão de confirmar', async () => {
    await open()
    const confirm = button(modal()!, 'Excluir definitivamente')
    expect(confirm.disabled).toBe(true)
    const input = modal()!.querySelector('input')!
    input.value = 'excluir'
    input.dispatchEvent(new Event('input'))
    await tick()
    expect(confirm.disabled).toBe(false)
  })

  it('fecha por "Fechar", clique no backdrop e Escape; clique dentro do modal não fecha', async () => {
    await open()
    modal()!.querySelector('h2')!.click() // stopPropagation no .modal
    await tick()
    expect(modal()).not.toBeNull()
    button(modal()!, 'Fechar').click()
    await tick()
    expect(modal()).toBeNull()

    const container = document.body.querySelector('.danger')!
    ;(container as HTMLButtonElement).click()
    await tick()
    backdrop()!.click()
    await tick()
    expect(modal()).toBeNull()
    ;(container as HTMLButtonElement).click()
    await tick()
    expect(modal()).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await tick()
    expect(modal()).toBeNull()
  })

  it('erro do handler async vai para o <Boundary>; "Tentar de novo" remonta', async () => {
    const container = await open()
    const input = modal()!.querySelector('input')!
    input.value = 'excluir'
    input.dispatchEvent(new Event('input'))
    await tick()
    vi.spyOn(api, 'deleteAccount').mockRejectedValueOnce(new Error('Servidor indisponível'))
    button(modal()!, 'Excluir definitivamente').click()
    await vi.waitFor(() => expect(container.querySelector('[role=alert]')).not.toBeNull())
    expect(container.querySelector('[role=alert]')!.textContent).toBe('Erro: Servidor indisponível Tentar de novo')
    expect(modal()).toBeNull() // o Boundary descartou os children (inclusive o conteúdo do Portal)

    button(container, 'Tentar de novo').click()
    await tick()
    expect(container.querySelector('[role=alert]')).toBeNull()
    expect(button(container, 'Excluir conta')).toBeDefined()
  })
})
