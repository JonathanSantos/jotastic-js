import { afterEach, describe, expect, test, vi } from 'vitest'
import { bool, classList, effect, insert, listen, memo, signal, template } from 'jotastic/runtime'
import { cleanup, counts, render, resetCounts, tick } from '../src/index'

// Counter escrito à mão no formato de docs/spec/compiled/01-counter.js.
const _t0 = template(
  '<section><h2></h2><p><!> (dobro: <!>)</p><button>+<!></button><button>-<!></button><button>Zerar</button></section>',
)

interface CounterProps {
  label?: string
  step?: number
}

let counterRuns = 0

function Counter(props: CounterProps) {
  counterRuns++
  const count = signal(0, { name: 'count', loc: 'Counter.tsx:5:7' })
  const double = memo(() => count.get() * 2, { name: 'double', loc: 'Counter.tsx:6:9' })
  const isEven = memo(() => count.get() % 2 === 0, { name: 'isEven', loc: 'Counter.tsx:7:9' })

  function reset() {
    count.set(0)
  }

  const _el = _t0()
  const _h2 = _el.firstChild!
  const _p = _h2.nextSibling as Element
  const _m0 = _p.firstChild!
  const _m1 = _m0.nextSibling!.nextSibling!
  const _b1 = _p.nextSibling as Element
  const _m2 = _b1.firstChild!.nextSibling!
  const _b2 = _b1.nextSibling as Element
  const _m3 = _b2.firstChild!.nextSibling!
  const _b3 = _b2.nextSibling as Element

  insert(_h2, () => props.label ?? 'Contador', null)
  classList(_p, () => ({ even: isEven.get(), odd: !isEven.get() }))
  insert(_p, () => count.get(), _m0)
  insert(_p, () => double.get(), _m1)
  listen(_b1, 'click', () => count.set(count.get() + (props.step ?? 1)))
  insert(_b1, () => props.step ?? 1, _m2)
  listen(_b2, 'click', () => count.set(count.get() - (props.step ?? 1)))
  insert(_b2, () => props.step ?? 1, _m3)
  listen(_b3, 'click', reset)
  bool(_b3, 'disabled', () => count.get() === 0)

  return _el
}

const buttons = (c: HTMLElement) => c.querySelectorAll('button')

afterEach(() => {
  cleanup()
  counterRuns = 0
})

describe('render', () => {
  test('monta um thunk em um container no document.body', () => {
    const { container } = render(() => Counter({ step: 5 }))
    expect(container.parentNode).toBe(document.body)
    expect(container.querySelector('h2')!.textContent).toBe('Contador')
    expect(container.querySelector('p')!.textContent).toBe('0 (dobro: 0)')
    expect(container.querySelector('p')!.className).toBe('even')
    expect(buttons(container)[0].textContent).toBe('+5')
    expect(buttons(container)[2].disabled).toBe(true)
  })

  test('aceita um valor já renderizado', () => {
    const el = document.createElement('span')
    el.textContent = 'oi'
    const { container } = render(el)
    expect(container.innerHTML).toBe('<span>oi</span>')
  })

  test('unmount desmonta e remove o container', async () => {
    const { container, unmount } = render(() => Counter({ step: 5 }))
    const btn = buttons(container)[0]
    unmount()
    expect(container.isConnected).toBe(false)
    expect(container.childNodes.length).toBe(0)
    resetCounts()
    btn.click()
    await tick()
    expect(counts().effects).toBe(0)
  })

  test('cleanup desmonta tudo que foi renderizado', () => {
    const a = render(() => Counter({}))
    const b = render(() => Counter({}))
    cleanup()
    expect(a.container.isConnected).toBe(false)
    expect(b.container.isConnected).toBe(false)
    expect(document.body.childNodes.length).toBe(0)
    expect(() => a.unmount()).not.toThrow()
  })
})

describe('counts', () => {
  test('Counter: clique em +5 → effects: 4, memos: 2; Counter não reexecuta (19 §Compilador)', async () => {
    const { container } = render(() => Counter({ step: 5 }))
    expect(counterRuns).toBe(1)
    resetCounts()
    buttons(container)[0].click()
    await tick()
    expect(container.querySelector('p')!.textContent).toBe('5 (dobro: 10)')
    expect(container.querySelector('p')!.className).toBe('odd')
    expect(buttons(container)[2].disabled).toBe(false)
    // count, double, classList, disabled
    expect(counts()).toMatchObject({ effects: 4, memos: 2 })
    expect(counts().writes).toBeGreaterThan(0)
    expect(counterRuns).toBe(1)
  })

  test('resetCounts zera; nada roda sem mudança', async () => {
    render(() => Counter({ step: 5 }))
    expect(counts().effects).toBeGreaterThan(0)
    resetCounts()
    await tick()
    expect(counts()).toEqual({ effects: 0, memos: 0, writes: 0 })
  })

  test('encadeia com um hook pré-existente', async () => {
    const g = globalThis as { __JOTASTIC_DEVTOOLS__?: { emit(e: unknown): void; registry: unknown } }
    const original = g.__JOTASTIC_DEVTOOLS__
    const emit = vi.fn()
    // Outro hook substitui o global: o próximo acesso ao @jotastic/test reinstala por cima, encadeando.
    g.__JOTASTIC_DEVTOOLS__ = { emit, registry: { owners: new Map() } }
    try {
      const { container } = render(() => Counter({ step: 1 }))
      resetCounts()
      buttons(container)[0].click()
      await tick()
      expect(counts().effects).toBe(4)
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'effect:run' }))
    } finally {
      cleanup()
      g.__JOTASTIC_DEVTOOLS__ = original
      counts()
    }
  })
})

describe('erros', () => {
  test('root sem onError relança (setup)', () => {
    expect(() =>
      render(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
  })

  test('root sem onError relança (binding no flush inicial)', () => {
    const t = template('<p></p>')
    expect(() =>
      render(() => {
        const p = t()
        insert(p, () => {
          throw new Error('binding')
        })
        return p
      }),
    ).toThrow('binding')
  })

  test('com onError o erro é entregue e não relança', () => {
    const onError = vi.fn()
    render(
      () => {
        effect(() => {
          throw new Error('efeito')
        })
        return null
      },
      { onError },
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0][0] as Error).message).toBe('efeito')
    expect(onError.mock.calls[0][1]).toMatchObject({ phase: 'effect' })
  })
})
