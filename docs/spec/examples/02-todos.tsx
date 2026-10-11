import { on } from 'jotastic'

interface Todo { id: string; text: string; done: boolean; editing?: boolean }
type Filter = 'all' | 'active' | 'done'

export function Todos() {
  let todos: Todo[] = []                      // array reativo: push/mutação de item funcionam
  let draft = ''
  let filter: Filter = 'all'

  // derivados
  const remaining = todos.filter(t => !t.done).length
  const visible = filter === 'all' ? todos : todos.filter(t => (filter === 'done') === t.done)
  const allDone = todos.length > 0 && remaining === 0

  function add(e: SubmitEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    todos.push({ id: crypto.randomUUID(), text, done: false })   // só a lista reage (1 nó inserido)
    draft = ''
  }

  function toggleAll() {
    const next = !allDone
    for (const t of todos) t.done = next     // vários sets no mesmo tick = 1 flush
  }

  on(document, 'keydown', e => {
    if (e.key === 'Escape') for (const t of todos) t.editing = false
  })

  return (
    <section class="todoapp">
      <form onSubmit={add}>
        <input value={draft} placeholder="O que fazer?" autofocus />      {/* two-way: o compilador gera o onInput */}
      </form>

      {todos.length === 0 && <p class="empty">Nada por aqui.</p>}

      <label>
        <input type="checkbox" checked={allDone} onChange={toggleAll} /> Marcar todas
      </label>

      <ul>
        {visible.map(todo => (                                             // key implícita: todo.id
          <li class={{ done: todo.done, editing: todo.editing }}>
            <input type="checkbox" checked={todo.done} />                  {/* muda só a classe deste <li> */}
            {todo.editing
              ? <input value={todo.text} onBlur={() => (todo.editing = false)} autofocus />
              : <span onDblClick={() => (todo.editing = true)}>{todo.text}</span>}
            <button onClick={() => (todos = todos.filter(t => t !== todo))}>×</button>
          </li>
        ))}
      </ul>

      <footer>
        <span>{remaining} {remaining === 1 ? 'item' : 'itens'}</span>
        <nav>
          {(['all', 'active', 'done'] as const).map(f => (
            <button class={{ active: filter === f }} onClick={() => (filter = f)}>{f}</button>
          ))}
        </nav>
        {remaining < todos.length && (
          <button onClick={() => (todos = todos.filter(t => !t.done))}>Limpar concluídas</button>
        )}
      </footer>
    </section>
  )
}

// `todos = todos.filter(...)` reatribui: os itens mantidos são os mesmos objetos (chave `id`),
// então a lista só remove os nós que saíram.
