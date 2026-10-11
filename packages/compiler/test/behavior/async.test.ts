// Comportamento de `await` compilado (18 §10): UserCard/Sidebar de examples/06-async.tsx compilados, com as mesmas
// asserções de packages/jotastic/test/compiled/05-async-user-card.test.ts (que roda a cópia escrita à mão de
// compiled/05); A8 (`let x = await` + mutação local); `await` encadeado, early return depois de `await`, `await` sem
// declarador, desestruturação de `Promise.all` e estado do setup que sobrevive a recargas.
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { component, signal, type Rendered } from 'jotastic/runtime'
import { cleanup, render, tick } from '@jotastic/test'
import { compile } from '../../src/index'
import { load, root } from '../helpers'
import { asyncInput } from '../inputs'
import { requests } from '../../../jotastic/test/compiled/shims-async'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props dos componentes compilados não são tipadas
type Comp = (props: any) => Rendered

/** `./lib/api` e `./components` da entrada → os stubs do teste do runtime (`api.user` controlado por `requests`). */
const SHIMS = `${root}packages/jotastic/test/compiled/shims-async.ts`
const withShims = (code: string) =>
  code.replace(`from './lib/api'`, `from '${SHIMS}'`).replace(`from './components'`, `from '${SHIMS}'`)

afterEach(() => {
  cleanup()
  requests.length = 0
})

/** Deixa as Promises resolvidas propagarem e o flush seguinte rodar. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await tick()
}

describe('UserCard/Sidebar (examples/06-async.tsx compilado)', () => {
  let mod: Record<string, Comp>
  beforeAll(async () => {
    mod = await load(withShims(asyncInput()), 'UserCard.tsx')
  })

  test('id muda → 1 requisição nova, anterior abortada, texto do nome atualiza 1×', async () => {
    const userId = signal('1')
    const { container } = render(() =>
      component(mod.Sidebar!, {
        get userId() {
          return userId.get()
        },
      }),
    )

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
    expect(h2.textContent).toBe('Ana')
    expect(article.classList.contains('dimmed')).toBe(true)
    expect(container.querySelector('.skeleton')).toBeNull()

    requests[1]!.resolve({ id: '2', name: 'Bia' })
    await settle()
    expect(h2.textContent).toBe('Bia')
    expect(article.classList.contains('dimmed')).toBe(false)
    expect(container.querySelector('article')).toBe(article)

    const records = [...delivered, ...mo.takeRecords()] // happy-dom 20 entrega os registros no callback
    expect(records.filter((r) => r.type === 'characterData').length).toBe(1)
    expect(records.filter((r) => r.type === 'childList').length).toBe(0)
    mo.disconnect()
  })

  test('refresh() refaz mantendo o valor; erro vai para o ErrorBox e retry refaz', async () => {
    const { container } = render(() => component(mod.Sidebar!, { userId: '7' }))
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

  test('saída: função não-async, `pending`/`refresh` reescritos e import removido', () => {
    const out = compile(asyncInput(), { filename: 'UserCard.tsx', dev: false }).code
    expect(out).not.toMatch(/async|await/)
    expect(out).toContain(`import { Boundary } from 'jotastic'`)
    expect(out).toContain('_r0.pending.get()')
    expect(out).toContain('_r0.refresh()')
  })
})

const HEAD = `import { refresh } from 'jotastic'\nimport { api } from './lib/api'\n`

async function mountAsync(body: string, name: string, props: Record<string, unknown> = {}) {
  const m = await load<Record<string, Comp>>(withShims(HEAD + body), `${name}.tsx`)
  return render(() => component(m[name]!, props)).container
}

test('A8: `let x = await` + `x.name = …` atualiza o binding; refresh traz o valor do servidor; `x = v` grava', async () => {
  const c = await mountAsync(
    `export async function Profile({ id }: { id: string }) {
      let user = await api.user(id)
      function rename(name: string) {
        user.name = name
      }
      return (
        <div>
          <h2>{user.name}</h2>
          <button class="rename" onClick={() => rename('y')}>r</button>
          <button class="refresh" onClick={() => refresh(user)}>a</button>
          <button class="set" onClick={() => (user = { id: 'z', name: 'Zé' })}>s</button>
        </div>
      )
    }`,
    'Profile',
    { id: '1' },
  )
  requests[0]!.resolve({ id: '1', name: 'Ana' })
  await settle()
  const h2 = c.querySelector('h2')!
  expect(h2.textContent).toBe('Ana')
  ;(c.querySelector('.rename') as HTMLButtonElement).click()
  await tick()
  expect(h2.textContent).toBe('y')
  ;(c.querySelector('.refresh') as HTMLButtonElement).click()
  await tick()
  expect(requests.length).toBe(2)
  expect(h2.textContent).toBe('y') // stale-while-revalidate
  requests[1]!.resolve({ id: '1', name: 'Ana (servidor)' })
  await settle()
  expect(h2.textContent).toBe('Ana (servidor)')
  ;(c.querySelector('.set') as HTMLButtonElement).click()
  await tick()
  expect(h2.textContent).toBe('Zé')
  expect(c.querySelector('h2')).toBe(h2) // continuação não recriada
})

test('`await` encadeado + early return depois do `await`: o segundo recurso lê o primeiro', async () => {
  const id = signal('1')
  const m = await load<Record<string, Comp>>(
    withShims(
      HEAD +
        `export async function Chain({ id }: { id: string }) {
          const user = await api.user(id)
          if (user.name === 'x') return <p class="x">x</p>
          const friend = await api.user(user.id + '-f')
          return <p class="ok">{user.name}/{friend.name}</p>
        }`,
    ),
    'Chain.tsx',
  )
  const c = render(() =>
    component(m.Chain!, {
      get id() {
        return id.get()
      },
    }),
  ).container
  expect(requests.map((r) => r.id)).toEqual(['1'])
  requests[0]!.resolve({ id: '1', name: 'Ana' })
  await settle()
  expect(requests.map((r) => r.id)).toEqual(['1', '1-f'])
  expect(c.textContent).toBe('')
  requests[1]!.resolve({ id: '1-f', name: 'Bia' })
  await settle()
  const p = c.querySelector('p.ok')!
  expect(p.textContent).toBe('Ana/Bia')

  id.set('2')
  await tick()
  expect(requests.map((r) => r.id)).toEqual(['1', '1-f', '2'])
  requests[2]!.resolve({ id: '2', name: 'Caio' })
  await settle()
  // `friend` lê `user.id`: refaz com o id novo; o nome de `user` já atualizou (sem coordenação, 07 §Consistência)
  expect(requests.map((r) => r.id)).toEqual(['1', '1-f', '2', '2-f'])
  expect(p.textContent).toBe('Caio/Bia')
  requests[3]!.resolve({ id: '2-f', name: 'Duda' })
  await settle()
  expect(c.querySelector('p.ok')).toBe(p)
  expect(p.textContent).toBe('Caio/Duda')

  // early return dentro da continuação do primeiro `await`
  id.set('3')
  await tick()
  requests[4]!.resolve({ id: '3', name: 'x' })
  await settle()
  expect(c.querySelector('p.x')).not.toBeNull()
  expect(c.querySelector('p.ok')).toBeNull()
})

test('`await` sem declarador, `Promise.all` desestruturado e estado do setup que sobrevive a recargas', async () => {
  const c = await mountAsync(
    `export async function Multi({ id }: { id: string }) {
      let clicks = 0
      await api.user('gate')
      const [a, b] = await Promise.all([api.user(id), api.user(id + 'b')])
      return <button onClick={() => { clicks++; refresh(a) }}>{a.name}+{b.name}:{clicks}</button>
    }`,
    'Multi',
    { id: '1' },
  )
  expect(requests.map((r) => r.id)).toEqual(['gate'])
  requests[0]!.resolve({ id: 'gate', name: '' })
  await settle()
  expect(requests.map((r) => r.id)).toEqual(['gate', '1', '1b'])
  requests[1]!.resolve({ id: '1', name: 'A' })
  requests[2]!.resolve({ id: '1b', name: 'B' })
  await settle()
  await settle()
  const btn = c.querySelector('button')!
  expect(btn.textContent).toBe('A+B:0')
  btn.click()
  await tick()
  // refresh(a) refaz o recurso do `Promise.all` (um recurso só)
  expect(requests.map((r) => r.id)).toEqual(['gate', '1', '1b', '1', '1b'])
  requests[3]!.resolve({ id: '1', name: 'A2' })
  requests[4]!.resolve({ id: '1b', name: 'B2' })
  await settle()
  await settle()
  expect(c.querySelector('button')).toBe(btn)
  expect(btn.textContent).toBe('A2+B2:1')
})

describe('diagnósticos de `await` (analyzer)', () => {
  const fail = (code: string): string => {
    try {
      compile(code, { filename: 'A.tsx' })
    } catch (e) {
      return (e as { id: string }).id
    }
    return 'compilou'
  }

  test('await-in-try e await-in-branch impedem a emissão', () => {
    expect(
      fail(
        `export async function A() {\n  try { const u = await f() } catch {}\n  return <p />\n}\ndeclare function f(): Promise<1>`,
      ),
    ).toBe('await-in-try')
    expect(
      fail(
        `export async function A({ x }: { x: boolean }) {\n  if (x) { await f() }\n  return <p />\n}\ndeclare function f(): Promise<1>`,
      ),
    ).toBe('await-in-branch')
  })

  test('await-waterfall é dica (não impede a emissão)', () => {
    const r = compile(
      `import { api } from './api'\nexport async function A() {\n  const a = await api.a()\n  const b = await api.b()\n  return <p>{a}{b}</p>\n}`,
      { filename: 'A.tsx' },
    )
    expect(r.diagnostics.map((d) => d.id)).toContain('await-waterfall')
  })
})
