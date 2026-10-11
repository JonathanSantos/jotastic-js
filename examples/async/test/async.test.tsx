import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, tick } from '@jotastic/test'
import { Boundary } from 'jotastic'
import { Dashboard, Profile, Search, Sidebar } from '../src/Async'
import { server } from '../src/server'
import { ErrorBox, Skeleton } from '../src/ui'

beforeEach(() => {
  server.reset()
  server.latency = Infinity // cada teste decide quando o "servidor" responde
})
afterEach(cleanup)

/** Deixa fetch → json → resource → continuação propagarem (várias Promises encadeadas) e o flush rodar. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await tick()
  }
}

async function respond(): Promise<void> {
  server.respondAll()
  await settle()
}

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text)!

/** `<Sidebar userId>` com o id controlado de fora. */
let setId: (id: string) => void = () => {}
function SidebarHarness() {
  let id = '1'
  setId = (v) => (id = v)
  return <Sidebar userId={id} />
}

describe('examples/async: UserCard + Sidebar', () => {
  it('pending → conteúdo: Skeleton até a resposta, depois o card', async () => {
    const { container } = render(<SidebarHarness />)
    expect(container.querySelector('.skeleton')).not.toBeNull()
    expect(container.querySelector('h2')!.textContent).toBe('Carregando…')
    expect(server.requests.map((r) => r.url)).toEqual(['/api/users/1'])

    await respond()
    expect(container.querySelector('.skeleton')).toBeNull()
    expect(container.querySelector('article h2')!.textContent).toBe('Ana')
    expect(container.querySelector('article')!.classList.contains('dimmed')).toBe(false)
  })

  it('troca de id aborta a requisição anterior e o nome atualiza 1×, no mesmo nó', async () => {
    const { container } = render(<SidebarHarness />)
    await respond()
    const article = container.querySelector('article')!
    const h2 = article.querySelector('h2')!

    const records: MutationRecord[] = []
    const mo = new MutationObserver((rs) => records.push(...rs))
    mo.observe(container, { subtree: true, childList: true, characterData: true })

    setId('2')
    await tick()
    expect(server.requests.map((r) => r.url)).toEqual(['/api/users/1', '/api/users/2'])
    expect(article.classList.contains('dimmed')).toBe(true) // conteúdo antigo fica, esmaecido
    expect(h2.textContent).toBe('Ana')

    setId('3') // antes de /users/2 responder
    await tick()
    expect(server.requests[1]!.signal!.aborted).toBe(true)
    expect(server.requests[2]!.url).toBe('/api/users/3')
    expect(server.requests[2]!.signal!.aborted).toBe(false)

    await respond()
    expect(h2.textContent).toBe('Caio')
    expect(container.querySelector('article')).toBe(article)
    expect(article.classList.contains('dimmed')).toBe(false)
    records.push(...mo.takeRecords())
    expect(records.filter((r) => r.type === 'characterData').length).toBe(1)
    expect(records.filter((r) => r.type === 'childList').length).toBe(0)
    mo.disconnect()
  })

  it('refresh(user) refaz a requisição e marca `dimmed` via pending() enquanto recarrega', async () => {
    const { container } = render(<SidebarHarness />)
    await respond()
    const article = container.querySelector('article')!

    button(article, 'Atualizar').click()
    await tick()
    expect(server.requests.length).toBe(2)
    expect(article.classList.contains('dimmed')).toBe(true)
    expect(article.querySelector('h2')!.textContent).toBe('Ana')
    expect(container.querySelector('.skeleton')).toBeNull() // não volta ao pending do Boundary

    await respond()
    expect(article.classList.contains('dimmed')).toBe(false)
    expect(container.querySelector('article')).toBe(article)
  })

  it('erro → UI de erro do Boundary → retry recarrega', async () => {
    server.fail = true
    const { container } = render(<SidebarHarness />)
    await respond()
    expect(container.querySelector('article')).toBeNull()
    expect(container.querySelector('[role=alert]')!.textContent).toBe('Erro: Servidor indisponívelTentar de novo')

    server.fail = false
    button(container, 'Tentar de novo').click()
    await settle()
    expect(container.querySelector('[role=alert]')).toBeNull()
    expect(container.querySelector('.skeleton')).not.toBeNull()

    await respond()
    expect(container.querySelector('article h2')!.textContent).toBe('Ana')
  })
})

describe('examples/async: Dashboard, Search', () => {
  it('Dashboard espera UserCard e UserPosts (awaits dependentes e paralelos); checkbox filtra', async () => {
    const { container } = render(<Dashboard userId="1" />)
    expect(container.querySelector('.spinner')).not.toBeNull()
    await respond() // users/1 (UserCard e UserPosts)
    expect(container.querySelector('.spinner')).not.toBeNull() // UserPosts ainda espera posts + tags
    expect(server.requests.map((r) => r.url).slice(2)).toEqual(['/api/users/1/posts', '/api/tags'])
    await respond()
    expect(container.querySelector('.spinner')).toBeNull()
    const titles = () => [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(titles()).toEqual(['Signals sem hooks #runtime', 'Rascunho: compilador #compilador'])

    const checkbox = container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await tick()
    expect(titles()).toEqual(['Signals sem hooks #runtime'])
  })

  it('Search: digitar não refaz a busca até o debounce; o estado antes do await sobrevive à recarga', async () => {
    const { container } = render(
      <Boundary pending={<Skeleton />} error={(e, retry) => <ErrorBox error={e as Error} onRetry={retry} />}>
        <Search />
      </Boundary>,
    )
    await respond()
    const input = container.querySelector<HTMLInputElement>('input')!
    expect(container.querySelectorAll('li').length).toBe(3)

    input.value = 'boundary'
    input.dispatchEvent(new Event('input'))
    await tick()
    expect(server.requests.length).toBe(1) // debounce de 300 ms
    await new Promise((r) => setTimeout(r, 320))
    await tick()
    expect(server.requests.at(-1)!.url).toBe('/api/search?q=boundary')
    expect(container.querySelector('ul')!.classList.contains('dimmed')).toBe(true)

    await respond()
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Boundary na prática'])
    expect(container.querySelector('input')).toBe(input)
    expect(input.value).toBe('boundary')
  })
})

describe('examples/async: Profile (optimistic update)', () => {
  async function mountProfile() {
    const { container } = render(
      <Boundary pending={<Skeleton />} error={(e, retry) => <ErrorBox error={e as Error} onRetry={retry} />}>
        <Profile id="1" />
      </Boundary>,
    )
    await respond()
    const input = container.querySelector<HTMLInputElement>('input')!
    const change = async (v: string) => {
      input.value = v
      input.dispatchEvent(new Event('change'))
      await tick()
    }
    return { container, input, change }
  }

  it('rename atualiza na hora e mantém quando o servidor confirma', async () => {
    const { input, change } = await mountProfile()
    expect(input.value).toBe('Ana')

    await change('Ana Maria')
    expect(input.value).toBe('Ana Maria')
    const patch = server.requests.at(-1)!
    expect(patch.method).toBe('PATCH')
    expect(patch.done).toBe(false) // UI atualizou antes da resposta

    await respond()
    expect(input.value).toBe('Ana Maria')
  })

  it('rename desfaz quando o servidor falha', async () => {
    const { container, input, change } = await mountProfile()
    server.fail = true
    await change('Zé')
    expect(input.value).toBe('Zé')

    await respond()
    expect(input.value).toBe('Ana')
    expect(container.querySelector('[role=alert]')).toBeNull() // erro tratado no handler, não vai ao Boundary
  })
})
