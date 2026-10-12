import { afterEach, expect, test } from 'vitest'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { component } from 'jotastic/runtime'
import { Todos } from './02-todos.js'
import { trace, type Trace } from './trace'

let tr: Trace | undefined
afterEach(() => {
  tr?.stop()
  tr = undefined
  cleanup()
})

async function mount() {
  tr = trace()
  const { container } = render(() => component(Todos, {}, { name: 'Todos' }))
  const q = <E extends Element = HTMLElement>(s: string) => container.querySelector(s) as E | null
  const form = q<HTMLFormElement>('form')!
  const input = q<HTMLInputElement>('form input')!
  const ul = q<HTMLUListElement>('ul')!
  const lis = () => Array.from(ul.children) as HTMLLIElement[]
  const texts = () => lis().map((li) => li.textContent!.replace('×', ''))
  const navButtons = () => Array.from(container.querySelectorAll('nav button')) as HTMLButtonElement[]
  async function type(text: string) {
    input.value = text
    input.dispatchEvent(new Event('input'))
    await tick()
  }
  async function add(text: string) {
    await type(text)
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await tick()
  }
  async function check(i: number, on = true) {
    const cb = lis()[i]!.querySelector('input')!
    cb.checked = on
    cb.dispatchEvent(new Event('change'))
    await tick()
  }
  /** Escritas no DOM (devtools) dentro do `<ul>` desde o último `tr.clear()`. */
  const ulWrites = () =>
    tr!.events.filter((e) => e.type === 'dom:write' && (ul === e.node || ul.contains(e.node))).length
  return { container, q, form, input, ul, lis, texts, navButtons, type, add, check, ulWrites, tr: tr! }
}

async function mountWith(...items: string[]) {
  const t = await mount()
  for (const text of items) await t.add(text)
  t.tr.clear()
  resetCounts()
  return t
}

test('Todos: monta vazio com mensagem, contador e filtros', async () => {
  const t = await mount()
  expect(t.q('p.empty')!.textContent).toBe('Nada por aqui.')
  expect(t.lis()).toHaveLength(0)
  expect(t.q('footer span')!.textContent).toBe('0 itens')
  expect(t.navButtons().map((b) => [b.textContent, b.className])).toEqual([
    ['all', 'active'],
    ['active', ''],
    ['done', ''],
  ])
  expect(t.q('footer > button')).toBeNull()
  // `autofocus` do input raiz é só o atributo nativo (17 §autofocus: `autofocus(el)` só em branch/item/continuação)
  expect(t.input.hasAttribute('autofocus')).toBe(true)
})

test('Todos: digitar 1 letra → effects: 1 (prop value do input), lista intocada', async () => {
  const t = await mountWith('a', 'b')
  const before = t.lis()
  await t.type('x')
  expect(counts()).toEqual({ effects: 1, memos: 0, writes: 0 }) // o input já tem 'x': prop não reescreve
  expect(t.ulWrites()).toBe(0)
  expect(t.lis().every((li, i) => li.isSameNode(before[i]!))).toBe(true)
})

test('Todos: adicionar item → 1 nó inserido; itens existentes isSameNode; draft limpo', async () => {
  const t = await mountWith('a', 'b')
  const before = t.lis()
  await t.add('c')
  expect(t.texts()).toEqual(['a', 'b', 'c'])
  expect(t.lis()[0]!.isSameNode(before[0]!)).toBe(true)
  expect(t.lis()[1]!.isSameNode(before[1]!)).toBe(true)
  const inserts = t.tr.events.filter((e) => e.type === 'dom:write' && e.op === 'insert' && e.node.parentNode === t.ul)
  expect(inserts).toHaveLength(1)
  expect(inserts[0]!.type === 'dom:write' && inserts[0]!.node).toBe(t.lis()[2])
  expect(t.input.value).toBe('')
  expect(t.q('p.empty')).toBeNull()
  expect(t.q('footer span')!.textContent).toBe('3 itens')
  // texto vazio não adiciona
  await t.add('   ')
  expect(t.lis()).toHaveLength(3)
})

test('Todos: marcar 1 item → efeitos só daquele li + rodapé; zero efeitos em outros itens (19 C-1)', async () => {
  const t = await mountWith('a', 'b', 'c')
  await t.check(0) // primeiro "done": também liga o botão "Limpar concluídas" (+2, fora desta medição)
  t.tr.clear()
  resetCounts()
  const before = t.lis()

  await t.check(1)

  expect(t.lis()[1]!.className).toBe('done')
  // Na lista: só a classe do li marcado. `prop checked` do próprio checkbox roda, mas não escreve; o `<ul>` em si não
  // tem escritas (nada inserido, removido ou movido).
  expect(t.ulWrites()).toBe(1)
  expect(t.tr.events.filter((e) => e.type === 'dom:write' && e.node === t.ul)).toHaveLength(0)
  expect(t.tr.writes()).toEqual(['text:#text', 'text:#text', 'class:li']) // "1", "item" no rodapé
  // effects: classList do li + prop checked (daquele li) + text {remaining} + text {item/itens}. Zero em outros itens.
  expect(counts().effects).toBe(4)
  // memos: remaining, allDone (+ índice do branch "Limpar concluídas", que lê `remaining`)
  expect(t.tr.memos()).toEqual(['remaining', 'allDone', expect.stringMatching(/^#\d+$/)])
  expect(t.lis().every((li, i) => li.isSameNode(before[i]!))).toBe(true)
  expect(t.q('footer span')!.textContent).toBe('1 item')
})

test('Todos: editar (dblclick → input com autofocus → digitar → blur)', async () => {
  const t = await mountWith('a', 'b')
  const li = t.lis()[0]!
  li.querySelector('span')!.dispatchEvent(new MouseEvent('dblclick'))
  await tick()
  expect(li.className).toBe('editing')
  expect(li.querySelector('span')).toBeNull()
  const edit = li.querySelector('input:not([type])') as HTMLInputElement
  expect(edit.value).toBe('a')
  expect(document.activeElement).toBe(edit)
  edit.value = 'alfa'
  edit.dispatchEvent(new Event('input'))
  await tick()
  edit.dispatchEvent(new Event('blur'))
  await tick()
  expect(li.className).toBe('')
  expect(li.querySelector('span')!.textContent).toBe('alfa')
  expect(t.lis()[0]).toBe(li)
  // Escape no document sai da edição de todos
  t.lis()[1]!.querySelector('span')!.dispatchEvent(new MouseEvent('dblclick'))
  await tick()
  expect(t.lis()[1]!.className).toBe('editing')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  await tick()
  expect(t.lis()[1]!.className).toBe('')
})

test('Todos: filtrar active/done/all', async () => {
  const t = await mountWith('a', 'b', 'c')
  await t.check(1)
  const [all, active, done] = t.navButtons()
  const liA = t.lis()[0]!
  active!.click()
  await tick()
  expect(t.texts()).toEqual(['a', 'c'])
  expect(t.lis()[0]).toBe(liA)
  expect(t.navButtons().map((b) => b.className)).toEqual(['', 'active', ''])
  done!.click()
  await tick()
  expect(t.texts()).toEqual(['b'])
  // desmarcar no filtro "done" tira o item da lista
  await t.check(0, false)
  expect(t.texts()).toEqual([])
  all!.click()
  await tick()
  expect(t.texts()).toEqual(['a', 'b', 'c'])
  expect(t.lis()[0]).not.toBe(liA) // saiu da lista no filtro "done": linha recriada
})

test('Todos: remover, marcar todas e limpar concluídas', async () => {
  const t = await mountWith('a', 'b', 'c')
  const liC = t.lis()[2]!
  ;(t.lis()[1]!.querySelector('button') as HTMLButtonElement).click()
  await tick()
  expect(t.texts()).toEqual(['a', 'c'])
  expect(t.lis()[1]).toBe(liC)

  const all = t.q<HTMLInputElement>('label input')!
  all.checked = true
  all.dispatchEvent(new Event('change'))
  await tick()
  expect(t.lis().map((li) => li.className)).toEqual(['done', 'done'])
  expect(t.lis().map((li) => (li.firstChild as HTMLInputElement).checked)).toEqual([true, true])
  expect(all.checked).toBe(true)
  expect(t.q('footer span')!.textContent).toBe('0 itens')

  await t.check(0, false)
  expect(all.checked).toBe(false)
  const clear = t.q<HTMLButtonElement>('footer > button')!
  expect(clear.textContent).toBe('Limpar concluídas')
  clear.click()
  await tick()
  expect(t.texts()).toEqual(['a'])
  expect(t.q('footer > button')).toBeNull()
  await t.check(0)
  t.q<HTMLButtonElement>('footer > button')!.click()
  await tick()
  expect(t.lis()).toHaveLength(0)
  expect(t.q('p.empty')).not.toBeNull()
})
