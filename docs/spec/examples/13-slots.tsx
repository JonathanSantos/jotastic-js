import { Slot, useSlots } from 'jotastic'

interface Item { id: string; name: string; price: number }

// Slots nomeados, slot padrão, slot com parâmetro e slot condicional. Tudo resolvido em build.
export function DataTable({ items, children }: { items: Item[]; children: JSX.Element }) {
  const slots = useSlots<{ toolbar: JSX.Element; row: (item: Item) => JSX.Element; empty: JSX.Element; footer: JSX.Element }>(children)
  let sortBy: keyof Item = 'name'

  const sorted = [...items].sort((a, b) => (a[sortBy] > b[sortBy] ? 1 : -1))

  if (items.length === 0) return <div class="empty">{slots.empty ?? 'Nada para mostrar'}</div>

  return (
    <section class="table">
      <header>
        {slots.default}                                   {/* o que não está em <Slot> */}
        {slots.toolbar}
        <select value={sortBy} onChange={e => (sortBy = e.currentTarget.value as keyof Item)}>
          <option value="name">Nome</option>
          <option value="price">Preço</option>
        </select>
      </header>

      <ul>
        {sorted.map(item => (
          <li>
            {slots.row ? slots.row(item) : item.name}     {/* slot com parâmetro */}
          </li>
        ))}
      </ul>

      {slots.footer && <footer>{slots.footer}</footer>}   {/* slots.footer é reativo se for condicional */}
    </section>
  )
}

export function Products({ items, admin }: { items: Item[]; admin: boolean }) {
  let selected: Item | null = null

  return (
    <DataTable items={items}>
      <h2>Produtos</h2>                                   {/* → slots.default */}

      <Slot name="toolbar">
        <button onClick={() => (selected = null)}>Limpar seleção</button>
      </Slot>

      <Slot name="row">
        {(item: Item) => (
          <button class={{ selected: selected?.id === item.id }} onClick={() => (selected = item)}>
            {item.name} — R$ {item.price}
          </button>
        )}
      </Slot>

      <Slot name="empty"><p>Nenhum produto cadastrado.</p></Slot>

      {admin && (
        <Slot name="footer">
          <button>Exportar CSV</button>
        </Slot>
      )}
    </DataTable>
  )
}

// Compilado, os children de <DataTable> viram:
//   { default: () => <h2/>, toolbar: () => …, row: (item) => …, empty: () => …, get footer() { return admin ? … : undefined } }
