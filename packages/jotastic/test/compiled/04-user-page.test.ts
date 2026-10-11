import { afterEach, beforeEach, expect, test } from 'vitest'
import { component, signal } from 'jotastic/runtime'
import { cleanup, render, tick } from '@jotastic/test'
import { UserPage } from './04-user-page.js'
import { mockFetch } from './fetch-mock'
import { trace, type Trace } from './trace'

let net: ReturnType<typeof mockFetch>
let tr: Trace
beforeEach(() => {
  net = mockFetch()
  tr = trace()
})
afterEach(() => {
  tr.stop()
  cleanup()
  net.restore()
})

function mount(initial = '1') {
  const id = signal(initial)
  const { container } = render(() =>
    component(
      UserPage,
      {
        get id() {
          return id.get()
        },
      },
      { name: 'UserPage' },
    ),
  )
  const tabs = () => Array.from(container.querySelectorAll('nav.tabs button')) as HTMLButtonElement[]
  const activeTab = () => tabs().find((b) => b.className === 'active')?.textContent
  return { id, container, tabs, activeTab }
}

test('UserPage: Spinner → continuação com fullName e Tabs', async () => {
  const p = mount()
  expect(p.container.querySelector('.spinner')).not.toBeNull()
  expect(net.requests[0]!.url).toBe('/api/users/1')
  await net.requests[0]!.resolve({ firstName: 'Ana', lastName: 'Lima' })
  expect(p.container.querySelector('.spinner')).toBeNull()
  expect(p.container.querySelector('h1')!.textContent).toBe('Ana Lima')
  expect(tr.memos()).toContain('fullName')
  expect(p.activeTab()).toBe('posts')
})

test('UserPage: estado da continuação muda sem recriar; id muda → Spinner antes de fullName rodar de novo', async () => {
  const p = mount()
  await net.requests[0]!.resolve({ firstName: 'Ana', lastName: 'Lima' })
  const div = p.container.querySelector('div > div')
  p.tabs()[1]!.click()
  await tick()
  expect(p.activeTab()).toBe('about')
  expect(p.container.querySelector('div > div')).toBe(div)

  tr.clear()
  p.id.set('2') // useFetch zera data → caso 2 ativa; a continuação é descartada antes de `fullName` reler user.data
  await tick()
  expect(p.container.querySelector('.spinner')).not.toBeNull()
  expect(p.container.querySelector('h1')).toBeNull()
  expect(tr.memos()).not.toContain('fullName')
  expect(net.requests[1]!.url).toBe('/api/users/2')

  await net.requests[1]!.resolve({ firstName: 'Bia', lastName: 'Reis' })
  expect(p.container.querySelector('h1')!.textContent).toBe('Bia Reis')
  expect(p.activeTab()).toBe('posts') // continuation-state-resets: `tab` nasceu de novo
  expect(p.container.querySelector('div > div')).not.toBe(div)
})

test('UserPage: erro → ErrorBox com a mensagem; nova id volta ao Spinner', async () => {
  const p = mount()
  await net.requests[0]!.resolve(null, { ok: false, statusText: 'Not Found' })
  expect(p.container.querySelector('p.error')!.textContent).toBe('Not Found')
  p.id.set('3')
  await tick()
  expect(p.container.querySelector('p.error')).toBeNull()
  expect(p.container.querySelector('.spinner')).not.toBeNull()
  await net.requests[1]!.resolve({ firstName: 'Cid', lastName: 'Moura' })
  expect(p.container.querySelector('h1')!.textContent).toBe('Cid Moura')
})

test('UserPage: dados mudam com a mesma continuação → só o h1 atualiza', async () => {
  const p = mount()
  await net.requests[0]!.resolve({ firstName: 'Ana', lastName: 'Lima' })
  const h1 = p.container.querySelector('h1')!
  p.id.set('1b')
  await tick()
  // data volta a null no início do efeito: sempre passa pelo Spinner (não há "mesma continuação" com useFetch)
  expect(p.container.querySelector('h1')).toBeNull()
  await net.requests[1]!.resolve({ firstName: 'Ana', lastName: 'Souza' })
  expect(p.container.querySelector('h1')!.textContent).toBe('Ana Souza')
  expect(p.container.querySelector('h1')).not.toBe(h1)
})
