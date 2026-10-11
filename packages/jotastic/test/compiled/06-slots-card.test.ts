import { afterEach, expect, test } from 'vitest'
import { component, signal, template } from 'jotastic/runtime'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { Card, Page, items } from './06-slots-card.js'

afterEach(cleanup)

function mountPage(initialAdmin: boolean) {
  const admin = signal(initialAdmin)
  const { container } = render(() =>
    component(Page, {
      get admin() {
        return admin.get()
      },
    }),
  )
  const card = container.querySelector('section.card')!
  return { admin, container, card }
}

test('Card: slot nomeado (header), default, slot com parâmetro (row) e footer ausente', () => {
  const { card } = mountPage(false)
  expect(card.querySelector('header')!.innerHTML).toBe('<h2>Título</h2>')
  expect(card.querySelector('.body')!.innerHTML).toBe('<p>Corpo do card</p>')
  expect(Array.from(card.querySelectorAll('ul > li')).map((li) => li.innerHTML)).toEqual(
    items.map((i) => `<b>${i.name}</b>`),
  )
  expect(card.querySelector('footer')).toBeNull()
})

test('Card: slot condicional (footer) liga e desliga com a prop, sem recriar o resto', async () => {
  const { admin, card } = mountPage(false)
  const header = card.querySelector('header')
  const lis = Array.from(card.querySelectorAll('li'))
  resetCounts()
  admin.set(true)
  await tick()
  expect(card.querySelector('footer')!.innerHTML).toBe('<button>Excluir</button>')
  expect(card.lastElementChild!.tagName).toBe('FOOTER')
  expect(card.querySelector('header')).toBe(header)
  expect(Array.from(card.querySelectorAll('li'))).toEqual(lis)
  // decisão do branch + insert do branch + 1ª execução do insert do <footer> novo; memo: só o índice do branch
  expect(counts()).toMatchObject({ effects: 3, memos: 1 })
  admin.set(false)
  await tick()
  expect(card.querySelector('footer')).toBeNull()
})

test('Card: children comuns (sem objeto de slots) viram slot default', () => {
  const _p = template('<p>só corpo</p>')
  const { container } = render(() => component(Card, { children: () => _p() }))
  const card = container.querySelector('section.card')!
  expect(card.querySelector('.body')!.innerHTML).toBe('<p>só corpo</p>')
  expect(card.querySelector('header')).toBeNull()
  expect(card.querySelector('footer')).toBeNull()
  expect(Array.from(card.querySelectorAll('li')).map((li) => li.innerHTML)).toEqual(['', ''])
})
