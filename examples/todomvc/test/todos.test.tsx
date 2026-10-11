import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { Todos } from '../src/Todos'

afterEach(cleanup)

function setup() {
  const { container } = render(<Todos />)
  const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector<T>(sel)!
  const draft = $<HTMLInputElement>('form input')
  const form = $<HTMLFormElement>('form')
  const items = () => [...container.querySelectorAll('ul li')]
  async function add(text: string) {
    draft.value = text
    draft.dispatchEvent(new Event('input'))
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await tick()
  }
  return { container, $, draft, form, items, add }
}

describe('examples/todomvc', () => {
  it('começa vazio', () => {
    const { container, items } = setup()
    expect(container.querySelector('.empty')?.textContent).toBe('Nada por aqui.')
    expect(items()).toHaveLength(0)
    expect(container.querySelector('footer span')!.textContent).toBe('0 itens')
  })

  it('adiciona itens pelo form e limpa o rascunho', async () => {
    const { container, draft, items, add } = setup()
    await add('Comprar pão')
    expect(draft.value).toBe('')
    await add('  ')
    expect(items().map((li) => li.querySelector('span')!.textContent)).toEqual(['Comprar pão'])
    expect(container.querySelector('.empty')).toBeNull()
    expect(container.querySelector('footer span')!.textContent).toBe('1 item')
  })

  it('digitar 1 letra → effects: 1, lista intocada (19 §Compilador)', async () => {
    const { container, draft, add } = setup()
    await add('a')
    const ul = container.querySelector('ul')!
    const before = ul.innerHTML
    resetCounts()
    draft.value = 'x'
    draft.dispatchEvent(new Event('input'))
    await tick()
    expect(counts().effects).toBe(1)
    expect(ul.innerHTML).toBe(before)
  })

  it('adicionar item → 1 nó inserido, existentes isSameNode (19 §Compilador)', async () => {
    const { container, items, add } = setup()
    await add('a')
    await add('b')
    const before = items()
    const ul = container.querySelector('ul')!
    const added: Node[] = []
    const removed: Node[] = []
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.target !== ul) continue
        added.push(...r.addedNodes)
        removed.push(...r.removedNodes)
      }
    })
    mo.observe(ul, { childList: true })
    await add('c')
    await new Promise((r) => setTimeout(r))
    mo.disconnect()
    const after = items()
    expect(after).toHaveLength(3)
    expect(after[0]!.isSameNode(before[0]!)).toBe(true)
    expect(after[1]!.isSameNode(before[1]!)).toBe(true)
    expect(added).toHaveLength(1)
    expect(added[0]).toBe(after[2])
    expect(removed).toHaveLength(0)
  })

  it('marcar 1 item: só a classe do li muda; contador e "Limpar concluídas" reagem', async () => {
    const { container, items, add } = setup()
    await add('a')
    await add('b')
    const [li] = items()
    const box = li!.querySelector<HTMLInputElement>('input[type=checkbox]')!
    resetCounts()
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await tick()
    // C-1 (21-pendencias): o mínimo pelo compiled/02 é 4 efeitos (+2 do branch "Limpar concluídas" no 1º marcado).
    expect(counts().effects).toBe(6)
    expect(li!.classList.contains('done')).toBe(true)
    expect(items()[1]!.classList.contains('done')).toBe(false)
    expect(container.querySelector('footer span')!.textContent).toBe('1 item')
    expect([...container.querySelectorAll('footer > button')].map((b) => b.textContent)).toEqual(['Limpar concluídas'])
  })

  it('filtros, marcar todas, remover e limpar concluídas', async () => {
    const { container, $, items, add } = setup()
    await add('a')
    await add('b')
    await add('c')
    const filterBtn = (name: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('nav button')].find((b) => b.textContent === name)!
    const texts = () => items().map((li) => li.querySelector('span')!.textContent)

    const second = items()[1]!.querySelector<HTMLInputElement>('input[type=checkbox]')!
    second.checked = true
    second.dispatchEvent(new Event('change'))
    await tick()

    filterBtn('done').click()
    await tick()
    expect(texts()).toEqual(['b'])
    expect(filterBtn('done').classList.contains('active')).toBe(true)
    filterBtn('active').click()
    await tick()
    expect(texts()).toEqual(['a', 'c'])
    filterBtn('all').click()
    await tick()
    expect(texts()).toEqual(['a', 'b', 'c'])

    // remover
    items()[0]!.querySelector('button')!.click()
    await tick()
    expect(texts()).toEqual(['b', 'c'])

    // marcar todas
    const all = $<HTMLInputElement>('label input')
    all.click()
    await tick()
    expect(items().every((li) => li.classList.contains('done'))).toBe(true)
    expect(all.checked).toBe(true)
    expect(container.querySelector('footer span')!.textContent).toBe('0 itens')

    // limpar concluídas
    $('footer > button').click()
    await tick()
    expect(items()).toHaveLength(0)
    expect(container.querySelector('.empty')).not.toBeNull()
    expect(container.querySelector('footer > button')).toBeNull()
  })

  it('duplo clique edita; blur e Escape saem da edição', async () => {
    const { items, add } = setup()
    await add('a')
    const li = items()[0]!
    li.querySelector('span')!.dispatchEvent(new Event('dblclick'))
    await tick()
    expect(li.classList.contains('editing')).toBe(true)
    const edit = li.querySelector<HTMLInputElement>('input:not([type])')!
    expect(edit.value).toBe('a')
    edit.value = 'a2'
    edit.dispatchEvent(new Event('input'))
    edit.dispatchEvent(new Event('blur'))
    await tick()
    expect(li.classList.contains('editing')).toBe(false)
    expect(li.querySelector('span')!.textContent).toBe('a2')

    li.querySelector('span')!.dispatchEvent(new Event('dblclick'))
    await tick()
    expect(li.querySelector('input:not([type])')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await tick()
    expect(li.querySelector('input:not([type])')).toBeNull()
  })
})
