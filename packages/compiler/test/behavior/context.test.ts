// I-3 (18 §4/§6): `<Ctx.Provider value={x}>` passa `value` como getter; o consumidor que lê `useContext(Ctx)` em
// contexto vivo acompanha o valor, direto no JSX ou via `const t = useContext(Ctx)` (o analyzer classifica `memo`).
// K-5: `let` comum (ref) passado como prop de componente vira getter.
import { afterEach, expect, test } from 'vitest'
import { component, signal, type Rendered } from 'jotastic/runtime'
import { cleanup, render, tick } from '@jotastic/test'
import { compile } from '../../src/index'
import { load } from '../helpers'

afterEach(cleanup)

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props dos componentes compilados não são tipadas
type Comp = (props: any) => Rendered

const source = `
import { createContext, useContext } from 'jotastic'

const Theme = createContext('light')

function Label() {
  return <p class={useContext(Theme)}>{useContext(Theme)}</p>
}

export function App({ dark }: { dark: boolean }) {
  return (
    <Theme.Provider value={dark ? 'dark' : 'light'}>
      <Label />
    </Theme.Provider>
  )
}
`

test('I-3: Provider com valor reativo atualiza o consumidor sem recriá-lo', async () => {
  const out = compile(source, { filename: 'App.tsx' }).code
  expect(out).toMatch(/get value\(\) \{\s*return props\.dark \? 'dark' : 'light'/)
  const m = await load<Record<string, Comp>>(source, 'App.tsx')
  const dark = signal(false)
  const { container } = render(() =>
    component(m.App!, {
      get dark() {
        return dark.get()
      },
    }),
  )
  const p = container.querySelector('p')!
  expect(p.textContent).toBe('light')
  dark.set(true)
  await tick()
  expect(container.querySelector('p')).toBe(p)
  expect(p.textContent).toBe('dark')
  expect(p.className).toBe('dark')
})

const constSource = `
import { createContext, useContext } from 'jotastic'

const Theme = createContext('light')

function Label() {
  const theme = useContext(Theme)
  const upper = theme.toUpperCase()
  return <p class={theme}>{upper}</p>
}

export function App({ dark }: { dark: boolean }) {
  return (
    <Theme.Provider value={dark ? 'dark' : 'light'}>
      <Label />
    </Theme.Provider>
  )
}
`

test('I-3: `const t = useContext(Ctx)` é reativo via o `const` (memo) e o que deriva dele', async () => {
  expect(compile(constSource, { filename: 'App.tsx' }).code).toMatch(/const theme = memo\(\(\) => useContext\(Theme\)/)
  const m = await load<Record<string, Comp>>(constSource, 'App.tsx')
  const dark = signal(false)
  const { container } = render(() =>
    component(m.App!, {
      get dark() {
        return dark.get()
      },
    }),
  )
  const p = container.querySelector('p')!
  expect(p.textContent).toBe('LIGHT')
  dark.set(true)
  await tick()
  expect(container.querySelector('p')).toBe(p)
  expect(p.textContent).toBe('DARK')
  expect(p.className).toBe('dark')
})

const refSource = `
import { onMount } from 'jotastic'

function Probe({ target, seen }: { target: HTMLElement | undefined; seen: (t: unknown) => void }) {
  onMount(() => seen(target))
  return null
}

export function Page({ seen }: { seen: (t: unknown) => void }) {
  let anchor: HTMLElement | undefined
  return (
    <div>
      <b ref={anchor}>alvo</b>
      <Probe target={anchor} seen={seen} />
    </div>
  )
}
`

test('K-5: `let` de ref passado como prop é lido no momento do uso (getter), não na criação', async () => {
  const out = compile(refSource, { filename: 'Page.tsx' }).code
  expect(out).toMatch(/get target\(\) \{\s*return anchor/)
  const m = await load<Record<string, Comp>>(refSource, 'Page.tsx')
  let seen: unknown = 'nada'
  const { container } = render(() => component(m.Page!, { seen: (t: unknown) => (seen = t) }))
  expect(seen).toBe(container.querySelector('b'))
})
