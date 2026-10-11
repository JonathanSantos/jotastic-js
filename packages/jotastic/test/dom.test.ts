import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  attr,
  autofocus,
  bool,
  classList,
  insert,
  listen,
  prop,
  spread,
  style,
  template,
  twoWay,
} from '../src/runtime/dom'
import {
  createOwner,
  dispose,
  getOwner,
  runWithOwner,
  setOnError,
  type ErrorInfo,
  type Owner,
} from '../src/runtime/owner'
import { effect, flush, signal } from '../src/runtime/reactive'
import { createRoot } from '../src/runtime/root'

/** Roda `fn` dentro de um owner raiz. */
function inRoot<T>(fn: (root: Owner) => T): T {
  const root = createOwner('root', null)
  return runWithOwner(root, () => fn(root))
}

/** Observa `node` e devolve uma função que lê (e consome) as mutações registradas até agora. */
function observe(node: Node): () => MutationRecord[] {
  const mo = new MutationObserver(() => {})
  mo.observe(node, { subtree: true, childList: true, characterData: true, attributes: true })
  return () => mo.takeRecords()
}

afterEach(() => {
  flush()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('DOM (D1–D13)', () => {
  test('D1 template clona fundo e parseia uma vez', () => {
    const spy = vi.spyOn(document, 'createElement')
    const t = template('<div class="a"><b>oi</b></div>')
    expect(spy).not.toHaveBeenCalled()
    const a = t()
    const b = t()
    expect(spy.mock.calls.filter(([tag]) => tag === 'template')).toHaveLength(1)
    expect(a).not.toBe(b)
    expect(a.outerHTML).toBe('<div class="a"><b>oi</b></div>')
    expect(a.firstChild).not.toBe(b.firstChild)
    expect(a.ownerDocument).toBe(document)
    // <!> vira comentário marcador
    const m = template('<p>x<!>y</p>')()
    expect(m.childNodes[1]!.nodeType).toBe(8)
  })

  test('D2 insert string → number → null → nó → array', () => {
    const p = document.createElement('p')
    const v = signal<unknown>('a')
    inRoot(() => insert(p, () => v.get(), null))
    expect(p.textContent).toBe('a')
    const text = p.firstChild
    v.set(42)
    flush()
    expect(p.textContent).toBe('42')
    expect(p.firstChild).toBe(text) // Text reutilizado
    v.set(0)
    flush()
    expect(p.textContent).toBe('0')
    v.set(null)
    flush()
    expect(p.childNodes).toHaveLength(0)
    const b = document.createElement('b')
    v.set(b)
    flush()
    expect(p.firstChild).toBe(b)
    expect(p.childNodes).toHaveLength(1)
    const i = document.createElement('i')
    v.set(['x', i, 1, [false, 'y']])
    flush()
    expect(p.innerHTML).toBe('x<i></i>1y')
    v.set(true)
    flush()
    expect(p.innerHTML).toBe('')
  })

  test('D2 insert com marker mantém vizinhos estáticos', () => {
    const p = template('<p>a<!>b</p>')()
    const m = p.childNodes[1]!
    const v = signal<unknown>('X')
    inRoot(() => insert(p, () => v.get(), m))
    expect(p.textContent).toBe('aXb')
    v.set([document.createElement('i'), 'Y'])
    flush()
    expect(p.innerHTML).toBe('a<i></i>Y<!---->b')
    v.set(undefined)
    flush()
    expect(p.innerHTML).toBe('a<!---->b')
  })

  test('D3 insert com mesmo texto não escreve', () => {
    const p = document.createElement('p')
    const v = signal<unknown>('a')
    const n = signal(0)
    inRoot(() =>
      insert(
        p,
        () => {
          n.get()
          return v.get()
        },
        null,
      ),
    )
    const records = observe(p)
    n.set(1) // reexecuta o binding com o mesmo texto
    flush()
    expect(records()).toHaveLength(0)
    v.set('b')
    flush()
    expect(records()).toHaveLength(1)
    // array com os mesmos nós: nada é movido
    const i = document.createElement('i')
    v.set(['x', i])
    flush()
    records()
    n.set(2)
    flush()
    expect(records()).toHaveLength(0)
  })

  test('D4 insert com accessor aninhado', () => {
    const p = document.createElement('p')
    const v = signal('a')
    inRoot(() => insert(p, () => () => [() => v.get(), '!'], null))
    expect(p.textContent).toBe('a!')
    v.set('b')
    flush()
    expect(p.textContent).toBe('b!')
    // valor estático sem função: sem efeito
    const q = document.createElement('q')
    inRoot(() => insert(q, ['s', 1], null))
    expect(q.textContent).toBe('s1')
  })

  test('D5 attr com false/null remove o atributo', () => {
    const el = document.createElement('a')
    const v = signal<unknown>('x')
    inRoot(() => attr(el, 'title', () => v.get()))
    expect(el.getAttribute('title')).toBe('x')
    v.set(false)
    flush()
    expect(el.hasAttribute('title')).toBe(false)
    v.set(true)
    flush()
    expect(el.getAttribute('title')).toBe('')
    v.set(null)
    flush()
    expect(el.hasAttribute('title')).toBe(false)
    v.set(3)
    flush()
    expect(el.getAttribute('title')).toBe('3')
    v.set(undefined)
    flush()
    expect(el.hasAttribute('title')).toBe(false)
  })

  test('D6 bool disabled presente/ausente', () => {
    const el = document.createElement('button')
    const v = signal<unknown>(true)
    inRoot(() => bool(el, 'disabled', () => v.get()))
    expect(el.getAttribute('disabled')).toBe('')
    v.set(0)
    flush()
    expect(el.hasAttribute('disabled')).toBe(false)
    v.set('yes')
    flush()
    expect(el.hasAttribute('disabled')).toBe(true)
  })

  test('D7 prop value igual não escreve (caret preservado)', () => {
    const el = document.createElement('input')
    document.body.append(el)
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!
    let writes = 0
    Object.defineProperty(el, 'value', {
      configurable: true,
      get() {
        return desc.get!.call(this)
      },
      set(v) {
        writes++
        desc.set!.call(this, v)
      },
    })
    const v = signal<unknown>('hello')
    const n = signal(0)
    inRoot(() =>
      prop(el, 'value', () => {
        n.get()
        return v.get()
      }),
    )
    expect(writes).toBe(1)
    el.setSelectionRange(2, 2)
    n.set(1)
    flush()
    expect(writes).toBe(1)
    expect(el.selectionStart).toBe(2)
    // número compara como string
    v.set('5')
    flush()
    expect(writes).toBe(2)
    v.set(5)
    flush()
    expect(writes).toBe(2)
    v.set(null)
    flush()
    expect(el.value).toBe('')
    // prop genérica
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    const c = signal(true)
    inRoot(() => prop(cb, 'checked', () => c.get()))
    expect(cb.checked).toBe(true)
    c.set(false)
    flush()
    expect(cb.checked).toBe(false)
  })

  test('D8 classList só aplica o diff e preserva classes estáticas', () => {
    const el = template('<p class="static base"></p>')()
    const v = signal<unknown>({ a: true, b: false })
    inRoot(() => classList(el, () => v.get() as never))
    expect([...el.classList]).toEqual(['static', 'base', 'a'])
    const records = observe(el)
    v.set({ a: true, b: false }) // objeto novo, mesmas classes
    flush()
    expect(records()).toHaveLength(0)
    v.set(['b', ['c', null, false], 'a'])
    flush()
    expect([...el.classList].sort()).toEqual(['a', 'b', 'base', 'c', 'static'])
    v.set('c  d')
    flush()
    expect([...el.classList].sort()).toEqual(['base', 'c', 'd', 'static'])
    // classe dinâmica que coincide com a estática não a remove
    v.set({ static: true })
    flush()
    v.set(null)
    flush()
    expect([...el.classList]).toEqual(['static', 'base'])
  })

  test('D9 style objeto: diff por chave, kebab, --var, px', () => {
    const el = document.createElement('div')
    const v = signal<unknown>({ fontSize: 12, opacity: 0.5, '--gap': '4px', backgroundColor: 'red' })
    inRoot(() => style(el, () => v.get() as never))
    expect(el.style.getPropertyValue('font-size')).toBe('12px')
    expect(el.style.getPropertyValue('opacity')).toBe('0.5')
    expect(el.style.getPropertyValue('--gap')).toBe('4px')
    expect(el.style.getPropertyValue('background-color')).toBe('red')
    const set = vi.spyOn(el.style, 'setProperty')
    const remove = vi.spyOn(el.style, 'removeProperty')
    v.set({ fontSize: 12, opacity: 0.5, '--gap': '8px', zIndex: 2 })
    flush()
    expect(set.mock.calls).toEqual([
      ['--gap', '8px'],
      ['z-index', '2'],
    ])
    expect(remove.mock.calls).toEqual([['background-color']])
    expect(el.style.getPropertyValue('z-index')).toBe('2') // unitless
    v.set('color: blue')
    flush()
    expect(el.style.cssText).toBe('color: blue;')
    v.set({ width: 10 })
    flush()
    expect(el.style.getPropertyValue('color')).toBe('')
    expect(el.style.getPropertyValue('width')).toBe('10px')
  })

  test('D10 listen: currentTarget, stopPropagation, erros → handleError', async () => {
    const parent = document.createElement('div')
    const child = document.createElement('button')
    parent.append(child)
    document.body.append(parent)
    const errors: [unknown, ErrorInfo][] = []
    let seenOwner: Owner | null = null
    let target: EventTarget | null = null
    let parentHits = 0
    const root = inRoot((root) => {
      setOnError(root, (e, info) => errors.push([e, info]))
      listen(parent, 'click', () => parentHits++)
      listen(child, 'click', (e) => {
        target = e.currentTarget
        seenOwner = getOwner()
        e.stopPropagation()
      })
      return root
    })
    child.click()
    expect(target).toBe(child)
    expect(seenOwner).toBe(root)
    expect(parentHits).toBe(0)

    const boom = new Error('sync')
    const el = document.createElement('i')
    const rejected = new Error('async')
    runWithOwner(root, () => {
      listen(el, 'click', () => {
        throw boom
      })
      listen(el, 'click', () => Promise.reject(rejected))
    })
    el.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(errors.map(([e, i]) => [e, i.phase])).toEqual([
      [boom, 'handler'],
      [rejected, 'handler'],
    ])

    // removido no dispose
    dispose(root)
    parent.click()
    expect(parentHits).toBe(0)
    child.click()
    expect(parentHits).toBe(0)
  })

  test('D10 handler não rastreia leituras', () => {
    const s = signal(0)
    const el = document.createElement('button')
    let runs = 0
    inRoot(() => {
      effect(
        () => {
          runs++
          el.click()
        },
        { kind: 'render' },
      )
      listen(el, 'click', () => s.get())
    })
    s.set(1)
    flush()
    expect(runs).toBe(1)
  })

  test('D11 twoWay por kind', () => {
    const fire = (el: Element, type: string) => el.dispatchEvent(new Event(type, { bubbles: true }))
    const got: Record<string, unknown> = {}
    inRoot(() => {
      const text = document.createElement('input')
      twoWay(text, 'value', (v) => (got.value = v))
      text.value = 'abc'
      fire(text, 'input')

      const num = document.createElement('input')
      num.type = 'number'
      twoWay(num, 'number', (v) => (got.number = v))
      num.value = '42'
      fire(num, 'input')
      expect(got.number).toBe(42)
      num.value = ''
      fire(num, 'input')

      const cb = document.createElement('input')
      cb.type = 'checkbox'
      twoWay(cb, 'checked', (v) => (got.checked = v))
      cb.checked = true
      fire(cb, 'input') // evento errado: ignorado
      expect(got.checked).toBeUndefined()
      fire(cb, 'change')

      const sel = document.createElement('select')
      sel.innerHTML = '<option value="a">a</option><option value="b">b</option>'
      twoWay(sel, 'select', (v) => (got.select = v))
      sel.value = 'b'
      fire(sel, 'change')

      const multi = document.createElement('select')
      multi.multiple = true
      multi.innerHTML = '<option value="a">a</option><option value="b">b</option><option value="c">c</option>'
      twoWay(multi, 'multiple', (v) => (got.multiple = v))
      ;(multi.options[0] as HTMLOptionElement).selected = true
      ;(multi.options[2] as HTMLOptionElement).selected = true
      fire(multi, 'change')
    })
    expect(got).toEqual({ value: 'abc', number: null, checked: true, select: 'b', multiple: ['a', 'c'] })
  })

  test('D11 twoWay atualiza o signal', () => {
    const name = signal('x')
    const input = document.createElement('input')
    inRoot(() => {
      prop(input, 'value', () => name.get())
      twoWay(input, 'value', (v) => name.set(v as string))
    })
    input.value = 'xy'
    input.dispatchEvent(new Event('input'))
    expect(name.get()).toBe('xy')
    flush()
    expect(input.value).toBe('xy')
  })

  test('D12 spread: chaves que somem são removidas; value com setter vira two-way', () => {
    const el = document.createElement('input')
    const props = signal<Record<string, unknown>>({ id: 'a', title: 't', class: 'c', disabled: true, 'data-x': 1 })
    inRoot(() => spread(el, () => props.get()))
    expect(el.id).toBe('a')
    expect(el.getAttribute('title')).toBe('t')
    expect(el.className).toBe('c')
    expect(el.hasAttribute('disabled')).toBe(true)
    expect(el.getAttribute('data-x')).toBe('1')
    props.set({ id: 'b', style: { width: 3 } })
    flush()
    expect(el.id).toBe('b')
    expect(el.hasAttribute('title')).toBe(false)
    expect(el.className).toBe('')
    expect(el.hasAttribute('disabled')).toBe(false)
    expect(el.hasAttribute('data-x')).toBe(false)
    expect(el.style.width).toBe('3px')

    // value com setter e sem onInput/onChange → two-way
    const name = signal('ana')
    const field = {
      get value() {
        return name.get()
      },
      set value(v: string) {
        name.set(v)
      },
    }
    const input = document.createElement('input')
    inRoot(() => spread(input, () => field as Record<string, unknown>))
    expect(input.value).toBe('ana')
    input.value = 'bia'
    input.dispatchEvent(new Event('input'))
    expect(name.get()).toBe('bia')
    name.set('caio')
    flush()
    expect(input.value).toBe('caio')

    // com onInput: one-way + o handler
    const seen: string[] = []
    const withHandler = signal<Record<string, unknown>>({
      get value() {
        return 'z'
      },
      set value(_v: string) {
        throw new Error('não deveria escrever')
      },
      onInput: (e: Event) => seen.push((e.currentTarget as HTMLInputElement).value),
    })
    const input2 = document.createElement('input')
    inRoot(() => spread(input2, () => withHandler.get()))
    input2.value = 'w'
    input2.dispatchEvent(new Event('input'))
    expect(seen).toEqual(['w'])
    // handler some → listener removido
    withHandler.set({ value: 'z' })
    flush()
    input2.dispatchEvent(new Event('input'))
    expect(seen).toEqual(['w'])
  })

  test('D12 spread: eventos, ref, children, rastreamento por chave', () => {
    const el = document.createElement('div')
    const label = signal('a')
    const clicks: string[] = []
    let ref: Element | null = null
    let titleReads = 0
    const obj = {
      onClick: () => clicks.push('click'),
      'on:custom-ev': () => clicks.push('custom'),
      ref: (e: Element) => (ref = e),
      get title() {
        titleReads++
        return 'fixo'
      },
      get children() {
        return label.get()
      },
    }
    inRoot(() => spread(el, () => obj as Record<string, unknown>))
    expect(ref).toBe(el)
    expect(el.textContent).toBe('a')
    el.click()
    el.dispatchEvent(new Event('custom-ev'))
    expect(clicks).toEqual(['click', 'custom'])
    const reads = titleReads
    label.set('b')
    flush()
    expect(el.textContent).toBe('b')
    expect(titleReads).toBe(reads) // só o binding de children reexecutou
  })

  test('D13 template svg no namespace SVG', () => {
    const g = template('<g><circle r="1"></circle></g>', true)()
    expect(g.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(g.firstElementChild!.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(g.localName).toBe('g')
  })
})

describe('autofocus', () => {
  test('foca no próximo flush depois da inserção', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const input = template('<input autofocus>')() as HTMLInputElement
    inRoot(() => {
      autofocus(input)
      insert(container, input, null)
    })
    expect(document.activeElement).not.toBe(input)
    flush()
    expect(document.activeElement).toBe(input)
  })
})

describe('createRoot', () => {
  test('insere, faz flush síncrono e unmount remove nós e descarta', () => {
    const target = document.createElement('div')
    target.append(document.createElement('header'))
    const count = signal(1)
    let mounted = 0
    let cleaned = 0
    let rootOwner: Owner | null = null
    const unmount = createRoot(target, () => {
      rootOwner = getOwner()
      effect(() => {
        mounted++
        return () => cleaned++
      })
      const p = document.createElement('p')
      insert(p, () => count.get(), null)
      return [p, () => (count.get() > 1 ? 'mais' : null)]
    })
    expect(rootOwner!.kind).toBe('root')
    expect(mounted).toBe(1) // flush síncrono rodou o efeito de usuário
    expect(target.innerHTML).toBe('<header></header><p>1</p>')
    count.set(2)
    flush()
    expect(target.innerHTML).toBe('<header></header><p>2</p>mais')
    unmount()
    expect(target.innerHTML).toBe('<header></header>')
    expect(cleaned).toBe(1)
    expect(rootOwner!.disposed).toBe(true)
    count.set(3)
    flush()
    expect(target.innerHTML).toBe('<header></header>')
    unmount() // idempotente
  })

  test('onError recebe erros de setup e de binding', () => {
    const errors: [unknown, string][] = []
    const boom = new Error('setup')
    createRoot(
      document.createElement('div'),
      () => {
        throw boom
      },
      { onError: (e, info) => errors.push([e, info.phase]) },
    )
    const bad = new Error('binding')
    const target = document.createElement('div')
    createRoot(
      target,
      () => [
        () => {
          throw bad
        },
        'ok',
      ],
      { onError: (e, info) => errors.push([e, info.phase]) },
    )
    expect(errors).toEqual([
      [boom, 'setup'],
      [bad, 'binding'],
    ])
  })
})
