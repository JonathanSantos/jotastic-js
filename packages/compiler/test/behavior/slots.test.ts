// Comportamento de slots compilados (18 §12): o Card/Page de compiled/06 (mesmas asserções de
// packages/jotastic/test/compiled/06-slots-card.test.ts) e um caso com render prop reativo, ternário e fragmento.
import { afterEach, beforeAll, expect, test } from 'vitest'
import { component, signal, type Rendered, template } from 'jotastic/runtime'
import { cleanup, counts, render, resetCounts, tick } from '@jotastic/test'
import { load } from '../helpers'
import { SLOTS_INPUT } from '../inputs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- props dos componentes compilados não são tipadas
type Comp = (props: any) => Rendered

// C-3: `items` não é declarado no spec; a entrada usa `declare const items`, então ele vem do escopo global
const items = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
]
;(globalThis as { items?: unknown }).items = items

let mod: Record<string, Comp>
beforeAll(async () => {
  mod = await load(SLOTS_INPUT, 'Page.tsx')
})
afterEach(cleanup)

function mountPage(initialAdmin: boolean) {
  const admin = signal(initialAdmin)
  const { container } = render(() =>
    component(mod.Page!, {
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
  expect(counts()).toMatchObject({ effects: 3, memos: 1 })
  admin.set(false)
  await tick()
  expect(card.querySelector('footer')).toBeNull()
})

test('Card: children comuns (sem objeto de slots) viram slot default', () => {
  const _p = template('<p>só corpo</p>')
  const { container } = render(() => component(mod.Card!, { children: () => _p() }))
  const card = container.querySelector('section.card')!
  expect(card.querySelector('.body')!.innerHTML).toBe('<p>só corpo</p>')
  expect(card.querySelector('header')).toBeNull()
  expect(card.querySelector('footer')).toBeNull()
  expect(Array.from(card.querySelectorAll('li')).map((li) => li.innerHTML)).toEqual(['', ''])
})

const source = `
import { Slot, useSlots } from 'jotastic'

export function Table({ rows, children }: { rows: string[]; children: JSX.Element }) {
  const s = useSlots<'title' | 'row' | 'badge'>(children)
  return (
    <div>
      <h1>{s.title}</h1>
      <em>{s.badge}</em>
      <ul>{rows.map((r) => <li>{s.row ? s.row(r) : r}</li>)}</ul>
      <footer>{s.default}</footer>
    </div>
  )
}

export function Products({ many }: { many: boolean }) {
  let selected = ''
  return (
    <Table rows={['x', 'y']}>
      <>
        <Slot name="title">Produtos {selected}</Slot>
      </>
      rodapé
      <Slot name="row">{(r: string) => <button class={{ on: selected === r }} onClick={() => (selected = r)}>{r}</button>}</Slot>
      {many ? <Slot name="badge">muitos</Slot> : <Slot name="badge">um</Slot>}
    </Table>
  )
}
`

test('render prop lê estado do pai, ternário entre dois <Slot> com o mesmo nome, fragmento e default de texto', async () => {
  const m = await load<Record<string, Comp>>(source, 'Products.tsx')
  const many = signal(false)
  const { container } = render(() =>
    component(m.Products!, {
      get many() {
        return many.get()
      },
    }),
  )
  const h1 = container.querySelector('h1')!
  const buttons = Array.from(container.querySelectorAll('button'))
  expect(h1.textContent).toBe('Produtos ')
  expect(buttons.map((b) => b.textContent)).toEqual(['x', 'y'])
  expect(container.querySelector('footer')!.textContent).toBe('rodapé')
  expect(container.querySelector('em')!.textContent).toBe('um')

  buttons[1]!.click()
  await tick()
  expect(h1.textContent).toBe('Produtos y')
  expect(buttons[1]!.className).toBe('on')
  expect(buttons[0]!.className).toBe('')
  expect(Array.from(container.querySelectorAll('button'))).toEqual(buttons) // itens não recriados

  many.set(true)
  await tick()
  expect(container.querySelector('em')!.textContent).toBe('muitos')
})

// X-8: 2+ filhos fora de <Slot> junto de um <Slot> (10-modal); X-9: `ref` em children de componente é limpo quando
// quem recebe descarta os nós (early return).
const modalSource = `
import { Slot, useSlots } from 'jotastic'

export function Box({ open, children }: { open: boolean; children: JSX.Element }) {
  const s = useSlots<'actions'>(children)
  if (!open) return null
  return (
    <section>
      <div class="body">{s.default}</div>
      <footer>{s.actions}</footer>
    </section>
  )
}

export function Page({ open, probe }: { open: boolean; probe: (get: () => unknown) => void }) {
  let input: HTMLInputElement | undefined
  probe(() => input)
  return (
    <Box open={open}>
      <p>Digite <code>ok</code></p>
      <input ref={input} />
      <Slot name="actions"><button>Confirmar</button></Slot>
    </Box>
  )
}
`

test('X-8/X-9: default com vários filhos + <Slot>; ref de children vira undefined quando o componente descarta', async () => {
  const m = await load<Record<string, Comp>>(modalSource, 'BoxPage.tsx')
  const open = signal(true)
  let getRef: () => unknown = () => null
  const { container } = render(() =>
    component(m.Page!, {
      get open() {
        return open.get()
      },
      probe: (g: () => unknown) => (getRef = g),
    }),
  )
  expect(container.querySelector('.body')!.innerHTML).toBe('<p>Digite <code>ok</code></p><input>')
  expect(container.querySelector('footer')!.innerHTML).toBe('<button>Confirmar</button>')
  expect(getRef()).toBe(container.querySelector('input'))

  open.set(false)
  await tick()
  expect(container.querySelector('section')).toBeNull()
  expect(getRef()).toBeUndefined()

  open.set(true)
  await tick()
  expect(getRef()).toBe(container.querySelector('input'))
})
