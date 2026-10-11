// Cópia de docs/spec/compiled/02-todos.js para rodar no runtime (passo 3). Ajustes marcados com `// [ajuste]`.
// Entrada: examples/02-todos.tsx
import { template, state, signal, memo, insert, classList, bool, prop, listen, twoWay, branches, list, on, autofocus } from 'jotastic/runtime'

const _t0 = template('<section class="todoapp"><form><input placeholder="O que fazer?" autofocus></form><!><label><input type="checkbox"> Marcar todas</label><ul></ul><footer><span><!> <!></span><nav></nav><!></footer></section>')
const _t1 = template('<p class="empty">Nada por aqui.</p>')
const _t2 = template('<li><input type="checkbox"><!><button>×</button></li>')
const _t3 = template('<input autofocus>')
const _t4 = template('<span></span>')
const _t5 = template('<button></button>')
const _t6 = template('<button>Limpar concluídas</button>')

export function Todos() {
  const todos = state([], { name: 'todos', loc: 'Todos.tsx:7:7' })           // array → `state` (proxy ao entrar)
  const draft = signal('', { name: 'draft', loc: 'Todos.tsx:8:7' })
  const filter = signal('all', { name: 'filter', loc: 'Todos.tsx:9:7' })

  const remaining = memo(() => todos.get().filter(t => !t.done).length, { name: 'remaining', loc: 'Todos.tsx:12:9' })
  const visible = memo(() => filter.get() === 'all' ? todos.get() : todos.get().filter(t => (filter.get() === 'done') === t.done), { name: 'visible', loc: 'Todos.tsx:13:9' })
  const allDone = memo(() => todos.get().length > 0 && remaining.get() === 0, { name: 'allDone', loc: 'Todos.tsx:14:9' })

  function add(e) {
    e.preventDefault()
    const text = draft.get().trim()
    if (!text) return
    todos.get().push({ id: crypto.randomUUID(), text, done: false })
    draft.set('')
  }

  function toggleAll() {
    const next = !allDone.get()
    for (const t of todos.get()) t.done = next
  }

  on(() => document, 'keydown', e => {
    if (e.key === 'Escape') for (const t of todos.get()) t.editing = false
  })

  const _el = _t0()
  const _form = _el.firstChild
  const _input = _form.firstChild
  const _m0 = _form.nextSibling                   // <!> do {todos.length === 0 && …}
  const _label = _m0.nextSibling
  const _check = _label.firstChild
  const _ul = _label.nextSibling
  const _footer = _ul.nextSibling
  const _span = _footer.firstChild
  const _m1 = _span.firstChild                    // <!> de {remaining}
  const _m2 = _m1.nextSibling.nextSibling         // <!> de {remaining === 1 ? …}
  const _nav = _span.nextSibling
  const _m3 = _nav.nextSibling                    // <!> do {remaining < todos.length && …}

  listen(_form, 'submit', add)
  prop(_input, 'value', () => draft.get())
  twoWay(_input, 'value', v => draft.set(v))                                   // value sem handler → two-way

  insert(_el, branches([[() => todos.get().length === 0, () => _t1()]]), _m0)

  prop(_check, 'checked', () => allDone.get())
  listen(_check, 'change', toggleAll)                                          // tem handler → one-way + handler

  list(_ul, null, () => visible.get(), (todo) => {                              // key omitida → item.id
    const _li = _t2()
    const _cb = _li.firstChild
    const _m = _cb.nextSibling
    const _btn = _m.nextSibling
    classList(_li, () => ({ done: todo.done, editing: todo.editing }))
    prop(_cb, 'checked', () => todo.done)
    twoWay(_cb, 'checked', v => (todo.done = v))
    insert(_li, branches([[() => todo.editing, () => {
      const _in = _t3()
      prop(_in, 'value', () => todo.text)
      twoWay(_in, 'value', v => (todo.text = v))
      listen(_in, 'blur', () => (todo.editing = false))
      autofocus(_in)
      return _in
    }]], () => {
      const _sp = _t4()
      listen(_sp, 'dblclick', () => (todo.editing = true))
      insert(_sp, () => todo.text, null)
      return _sp
    }), _m)
    listen(_btn, 'click', () => todos.set(todos.get().filter(t => t !== todo)))
    return _li
  }, undefined, { loc: 'Todos.tsx:41:10' })

  insert(_span, () => remaining.get(), _m1)
  insert(_span, () => remaining.get() === 1 ? 'item' : 'itens', _m2)

  list(_nav, null, () => ['all', 'active', 'done'], (f) => {                   // primitivos → chave por índice
    const _b = _t5()
    classList(_b, () => ({ active: filter.get() === f }))
    listen(_b, 'click', () => filter.set(f))
    insert(_b, () => f, null)
    return _b
  })

  insert(_footer, branches([[() => remaining.get() < todos.get().length, () => {
    const _b = _t6()
    listen(_b, 'click', () => todos.set(todos.get().filter(t => !t.done)))
    return _b
  }]]), _m3)

  return _el
}
