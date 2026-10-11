import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { App } from '../src/App'
import { theme } from '../src/Styling'

afterEach(() => {
  cleanup()
  theme.$reset()
})

const html = () => document.documentElement
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text)!

describe('examples/styling', () => {
  it('class como array/objeto e tema no <html> via watch', async () => {
    const { container } = render(<App />)
    const save = button(container, 'Salvar')
    expect([...save.classList]).toEqual(['btn', 'btn-primary', 'btn-md'])
    expect(html().dataset.theme).toBe('light')
    expect(html().style.getPropertyValue('--accent')).toBe('#6750a4')

    const toggle = container.querySelector<HTMLButtonElement>('.btn-ghost')!
    expect(toggle.textContent).toBe('☀️')
    toggle.click()
    await tick()
    expect(html().dataset.theme).toBe('dark')
    expect(toggle.textContent).toBe('🌙')
    expect(container.querySelector('section')!.className).toContain('bg-zinc-900 text-white')

    button(container, '#0b7285').click()
    await tick()
    expect(html().style.getPropertyValue('--accent')).toBe('#0b7285')
    expect(container.querySelector<HTMLElement>('.progress')!.style.getPropertyValue('--accent')).toBe('#0b7285')
  })

  it('loading: classe, disabled e spinner', async () => {
    const { container } = render(<App />)
    const save = button(container, 'Salvar')
    save.click()
    await tick()
    expect(save.classList.contains('loading')).toBe(true)
    expect(save.disabled).toBe(true)
    expect(save.querySelector('.spinner')).not.toBeNull()
  })

  it('style objeto: range → só a ProgressBar muda', async () => {
    const { container } = render(<App />)
    const bar = container.querySelector<HTMLElement>('.progress')!
    expect(bar.style.getPropertyValue('--pct')).toBe('40%')
    const range = container.querySelector<HTMLInputElement>('input[type=range]')!
    resetCounts()
    range.value = '100'
    range.dispatchEvent(new Event('input'))
    await tick()
    expect(bar.style.getPropertyValue('--pct')).toBe('100%')
    expect(bar.querySelector<HTMLElement>('.progress-fill')!.style.width).toBe('100%')
    expect(bar.querySelector('span')!.style.fontWeight).toBe('700')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(counts().writes).toBeLessThanOrEqual(6)
  })

  it('heatmap: mutar células atualiza o style só das células, sem recriar nós', async () => {
    const { container } = render(<App />)
    const cells = [...container.querySelectorAll<HTMLElement>('.cell')]
    expect(cells).toHaveLength(32)
    expect(cells[1]!.title).toBe('37')
    const before = cells.map((c) => c.title)
    button(container, 'Embaralhar').click()
    await tick()
    const after = [...container.querySelectorAll<HTMLElement>('.cell')]
    expect(after.every((c, i) => c === cells[i])).toBe(true)
    // happy-dom 15 descarta `hsl()` com sintaxe de espaços em `background`: o style é conferido no browser; aqui, o title
    expect(after.map((c) => c.title)).not.toEqual(before)
  })
})
