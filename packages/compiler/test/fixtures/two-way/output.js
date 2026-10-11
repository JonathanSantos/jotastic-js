import { template, signal, state, reactive, prop, twoWay, listen, attr } from 'jotastic/runtime'
const _t0 = template(
  '<form data-jo="input.tsx:14"><input><input type="number"><input type="range"><input type="checkbox"><select><option value="free">Free</option></select><select multiple></select><textarea></textarea><input type="radio"><input><input readonly><input><input><input><input></form>',
)
export function Form(props) {
  const text = signal('', {
    name: 'text',
    loc: 'input.tsx:2:7',
  })
  const age = signal(0, {
    name: 'age',
    loc: 'input.tsx:3:7',
  })
  const vol = signal(5, {
    name: 'vol',
    loc: 'input.tsx:4:7',
  })
  const agree = signal(false, {
    name: 'agree',
    loc: 'input.tsx:5:7',
  })
  const plan = signal('free', {
    name: 'plan',
    loc: 'input.tsx:6:7',
  })
  const tags = state([], {
    name: 'tags',
    loc: 'input.tsx:7:7',
  })
  const note = signal('', {
    name: 'note',
    loc: 'input.tsx:8:7',
  })
  const choice = signal('a', {
    name: 'choice',
    loc: 'input.tsx:9:7',
  })
  const locked = state('', {
    name: 'locked',
    loc: 'input.tsx:10:7',
  })
  const user = reactive({
    name: '',
  })
  const kind = signal('text', {
    name: 'kind',
    loc: 'input.tsx:12:7',
  })
  const _el = _t0()
  const _input = _el.firstChild
  const _input2 = _input.nextSibling
  const _input3 = _input2.nextSibling
  const _input4 = _input3.nextSibling
  const _select = _input4.nextSibling
  const _select2 = _select.nextSibling
  const _textarea = _select2.nextSibling
  const _input5 = _textarea.nextSibling
  const _input6 = _input5.nextSibling
  const _input7 = _input6.nextSibling
  const _input8 = _input7.nextSibling
  const _input9 = _input8.nextSibling
  const _input10 = _input9.nextSibling
  const _input11 = _input10.nextSibling
  prop(_input, 'value', () => text.get())
  twoWay(_input, 'value', (v) => text.set(v))
  prop(_input2, 'value', () => age.get())
  twoWay(_input2, 'number', (v) => age.set(v))
  prop(_input3, 'value', () => vol.get())
  twoWay(_input3, 'number', (v) => vol.set(v))
  prop(_input4, 'checked', () => agree.get())
  twoWay(_input4, 'checked', (v) => agree.set(v))
  prop(_select, 'value', () => plan.get())
  twoWay(_select, 'select', (v) => plan.set(v))
  prop(_select2, 'value', () => tags.get())
  twoWay(_select2, 'multiple', (v) => tags.set(v))
  prop(_textarea, 'value', () => note.get())
  twoWay(_textarea, 'value', (v) => note.set(v))
  prop(_input5, 'checked', () => choice.get() === 'a')
  prop(_input6, 'value', () => locked.get())
  listen(_input6, 'input', (e) => locked.set(e.currentTarget.value))
  prop(_input7, 'value', () => locked.get())
  prop(_input8, 'value', () => user.name)
  twoWay(_input8, 'value', (v) => (user.name = v))
  prop(_input9, 'value', () => props.external)
  attr(_input10, 'type', () => kind.get())
  prop(_input10, 'value', () => text.get())
  twoWay(_input10, 'value', (v) => text.set(v))
  prop(_input11, 'value', () => text.get().trim())
  return _el
}
