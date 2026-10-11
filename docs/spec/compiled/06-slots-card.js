// Entrada: spec 02-componentes.md §Slots
//
// function Card({ children }: ParentProps) {
//   const slots = useSlots<'header' | 'footer' | 'row'>(children)
//   return (
//     <section class="card">
//       {slots.header && <header>{slots.header}</header>}
//       <div class="body">{slots.default}</div>
//       <ul>{items.map(i => <li key={i.id}>{slots.row?.(i)}</li>)}</ul>
//       {slots.footer && <footer>{slots.footer}</footer>}
//     </section>
//   )
// }
// <Card>
//   <Slot name="header"><h2>Título</h2></Slot>
//   <p>Corpo do card</p>
//   <Slot name="row">{(item: Item) => <b>{item.name}</b>}</Slot>
//   {admin && <Slot name="footer"><button>Excluir</button></Slot>}
// </Card>
import { template, slots, insert, branches, list, component, SLOTS } from 'jotastic/runtime'

const _t0 = template('<section class="card"><!><div class="body"></div><ul></ul><!></section>')
const _t1 = template('<header></header>')
const _t2 = template('<li></li>')
const _t3 = template('<footer></footer>')

export function Card(props) {
  const _slots = slots(props.children)          // useSlots(children) → slots(props.children); `slots.x` fica como está

  const _el = _t0()
  const _m0 = _el.firstChild
  const _body = _m0.nextSibling
  const _ul = _body.nextSibling
  const _m1 = _ul.nextSibling

  insert(_el, branches([[() => !!_slots.header, () => { const _h = _t1(); insert(_h, () => _slots.header, null); return _h }]]), _m0)
  insert(_body, () => _slots.default, null)
  list(_ul, null, () => items, (i) => { const _li = _t2(); insert(_li, () => _slots.row?.(i), null); return _li }, (i) => i.id)
  insert(_el, branches([[() => !!_slots.footer, () => { const _f = _t3(); insert(_f, () => _slots.footer, null); return _f }]]), _m1)
  return _el
}

// Uso: os children viram um objeto de slots, cada entrada lazy
const _t4 = template('<h2>Título</h2>')
const _t5 = template('<p>Corpo do card</p>')
const _t6 = template('<b></b>')
const _t7 = template('<button>Excluir</button>')

export function Page(props) {
  return component(Card, {
    children: {
      [SLOTS]: true,
      default: () => _t5(),
      header: () => _t4(),
      row: (item) => { const _b = _t6(); insert(_b, () => item.name, null); return _b },
      get footer() { return props.admin ? () => _t7() : undefined },     // condicional → getter que devolve função ou undefined
    },
  }, { name: 'Card', loc: 'Page.tsx:2:5' })
}
