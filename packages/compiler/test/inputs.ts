// Entradas montadas a partir de docs/spec (lidas direto de docs/, nunca copiadas) para snapshots e comportamento.
import { spec } from './helpers'
import { sliceFunction } from './snapshot'

/**
 * Entrada do 03: o recorte que o próprio snapshot declara (`useFetch`, `useMediaQuery`, `useClickOutside` de
 * examples/07-use-functions.ts), com os imports que esses três usam. `useFetch` começa na linha 4, como os `loc`
 * `useFetch.ts:5:7`/`6:7`/`8:3` do snapshot pressupõem.
 */
export function useFetchInput(): string {
  const src = spec('examples/07-use-functions.ts')
  return [
    `import { watch, on } from 'jotastic'`,
    `import { fetch } from 'jotastic/fetch'`,
    '',
    sliceFunction(src, 'useFetch'),
    '',
    sliceFunction(src, 'useMediaQuery'),
    '',
    sliceFunction(src, 'useClickOutside'),
    '',
  ].join('\n')
}

/**
 * Entrada do 06: o código do comentário de compiled/06 (spec 02 §Slots) em um arquivo. `items` não é declarado no
 * spec (C-3): `declare const` (some na remoção de tipos, fica global como no snapshot). `admin` vira prop de `Page`,
 * como o snapshot pressupõe (`props.admin`).
 */
export const SLOTS_INPUT = `import { Slot, useSlots, type ParentProps } from 'jotastic'

interface Item {
  id: string
  name: string
}
declare const items: Item[]

export function Card({ children }: ParentProps) {
  const slots = useSlots<'header' | 'footer' | 'row'>(children)
  return (
    <section class="card">
      {slots.header && <header>{slots.header}</header>}
      <div class="body">{slots.default}</div>
      <ul>{items.map(i => <li key={i.id}>{slots.row?.(i)}</li>)}</ul>
      {slots.footer && <footer>{slots.footer}</footer>}
    </section>
  )
}

export function Page({ admin }: { admin: boolean }) {
  return (
    <Card>
      <Slot name="header"><h2>Título</h2></Slot>
      <p>Corpo do card</p>
      <Slot name="row">{(item: Item) => <b>{item.name}</b>}</Slot>
      {admin && <Slot name="footer"><button>Excluir</button></Slot>}
    </Card>
  )
}
`
