export function Literals() {
  let n = 1
  const todos = [{ id: 1, done: false }]
  const cart = {
    items: [] as number[],
    get count() {
      return this.items.length
    },
    get total() {
      return this.items.reduce((a, b) => a + b, 0) * n
    },
  }
  const derived = { double: n * 2 }
  const { first, second = 2 } = derived
  return (
    <p>
      {todos.length} {cart.count} {cart.total} {derived.double} {first} {second}
    </p>
  )
}
