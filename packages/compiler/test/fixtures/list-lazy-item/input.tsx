// D58 (18 §4/§8): o item é lazy: leituras `item()`, escrita `item().x = v`, desestruturação `({ name }) =>` → `item().name`
interface Todo { id: number; text: string; done: boolean }

export function Items({ todos, onPick }: { todos: Todo[]; onPick: (t: Todo) => void }) {
  return (
    <div>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id} onClick={() => onPick(todo)}>
            <input type="checkbox" checked={todo.done} />
            <button onClick={() => (todo.done = !todo.done)}>{todo.text}</button>
          </li>
        ))}
      </ul>
      <ol>
        {todos.map(({ id, text, done = false }) => {
          const label = `${id}: ${text}`
          return (
            <li key={id} class={{ done }} onClick={() => (text = text + '!')}>
              {label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
