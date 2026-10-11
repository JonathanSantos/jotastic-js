import { afterEach, expect, test } from 'vitest'
import { component, signal } from 'jotastic/runtime'
import { cleanup, render, tick } from '@jotastic/test'
import { Sidebar } from './05-async-user-card.js'
import { requests } from './shims-async'

afterEach(() => {
  cleanup()
  requests.length = 0
})

/** Deixa as Promises resolvidas propagarem e o flush seguinte rodar. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await tick()
}

test('UserCard: id muda → 1 requisição nova, anterior abortada, texto do nome atualiza 1×', async () => {
  const userId = signal('1')
  const { container } = render(() =>
    component(Sidebar, {
      get userId() {
        return userId.get()
      },
    }),
  )

  // Primeiro carregamento: Skeleton do Boundary.
  expect(requests.length).toBe(1)
  expect(container.querySelector('.skeleton')).not.toBeNull()
  expect(container.querySelector('article')).toBeNull()

  requests[0]!.resolve({ id: '1', name: 'Ana' })
  await settle()
  const h2 = container.querySelector('h2')!
  expect(h2.textContent).toBe('Ana')
  expect(container.querySelector('.skeleton')).toBeNull()
  const article = container.querySelector('article')!

  const delivered: MutationRecord[] = []
  const mo = new MutationObserver((rs) => delivered.push(...rs))
  mo.observe(container, { subtree: true, childList: true, characterData: true })

  userId.set('2')
  await tick()
  expect(requests.length).toBe(2)
  expect(requests[0]!.signal.aborted).toBe(true)
  expect(requests[1]!.signal.aborted).toBe(false)
  expect(requests[1]!.id).toBe('2')
  // Recarga mantém o conteúdo (stale-while-revalidate), com `dimmed` enquanto pending.
  expect(h2.textContent).toBe('Ana')
  expect(article.classList.contains('dimmed')).toBe(true)
  expect(container.querySelector('.skeleton')).toBeNull()

  requests[1]!.resolve({ id: '2', name: 'Bia' })
  await settle()
  expect(h2.textContent).toBe('Bia')
  expect(article.classList.contains('dimmed')).toBe(false)
  expect(container.querySelector('article')).toBe(article) // continuação não recriada

  const records = [...delivered, ...mo.takeRecords()] // happy-dom 20 entrega os registros no callback
  expect(records.filter((r) => r.type === 'characterData').length).toBe(1)
  expect(records.filter((r) => r.type === 'childList').length).toBe(0)
  mo.disconnect()
})

test('UserCard: refresh() refaz a requisição mantendo o valor; erro vai para o ErrorBox e retry refaz', async () => {
  const { container } = render(() => component(Sidebar, { userId: '7' }))
  requests[0]!.resolve({ id: '7', name: 'Caio' })
  await settle()

  container.querySelector('button')!.click()
  await tick()
  expect(requests.length).toBe(2)
  expect(container.querySelector('h2')!.textContent).toBe('Caio')

  requests[1]!.reject(new Error('falhou'))
  await settle()
  expect(container.querySelector('article')).toBeNull()
  expect(container.querySelector('.error span')!.textContent).toBe('falhou')

  ;(container.querySelector('.error button') as HTMLButtonElement).click()
  await tick()
  expect(requests.length).toBe(3)
  expect(container.querySelector('.skeleton')).not.toBeNull()
  requests[2]!.resolve({ id: '7', name: 'Caio 2' })
  await settle()
  expect(container.querySelector('h2')!.textContent).toBe('Caio 2')
})
