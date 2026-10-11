import { Products } from './Slots'

let nextId = 4

export function App() {
  let admin = false
  let items = [
    { id: '1', name: 'Teclado', price: 250 },
    { id: '2', name: 'Mouse', price: 90 },
    { id: '3', name: 'Monitor', price: 1200 },
  ]

  function add() {
    const id = String(nextId++)
    items.push({ id, name: `Produto ${id}`, price: Math.round(Math.random() * 500) })
  }

  return (
    <main>
      <p>
        <label>
          <input type="checkbox" checked={admin} /> admin
        </label>{' '}
        <button onClick={add}>Adicionar produto</button> <button onClick={() => (items = [])}>Remover todos</button>
      </p>
      <Products items={items} admin={admin} />
    </main>
  )
}
