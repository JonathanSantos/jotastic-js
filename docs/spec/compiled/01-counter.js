// Entrada: examples/01-counter.tsx
import { template, signal, memo, insert, text, classList, bool, listen, component } from 'jotastic/runtime'
import { mount } from 'jotastic'

const _t0 = template('<section data-jo="Counter.tsx:4"><h2></h2><p><!> (dobro: <!>)</p><button>+<!></button><button>-<!></button><button>Zerar</button></section>')

export function Counter(props) {
  // `label` e `step` só são lidos no JSX → getters de props, sem signal.
  const count = signal(0, { name: 'count', loc: 'Counter.tsx:5:7' })
  const double = memo(() => count.get() * 2, { name: 'double', loc: 'Counter.tsx:6:9' })
  const isEven = memo(() => count.get() % 2 === 0, { name: 'isEven', loc: 'Counter.tsx:7:9' })

  function reset() {
    count.set(0)
  }

  const _el = _t0()
  const _h2 = _el.firstChild
  const _p = _h2.nextSibling
  const _m0 = _p.firstChild                       // <!> de {count}
  const _m1 = _m0.nextSibling.nextSibling         // <!> de {double}
  const _b1 = _p.nextSibling
  const _m2 = _b1.firstChild.nextSibling          // <!> de {step} no "+"
  const _b2 = _b1.nextSibling
  const _m3 = _b2.firstChild.nextSibling          // <!> de {step} no "-"
  const _b3 = _b2.nextSibling

  insert(_h2, () => props.label ?? 'Contador', null)                            // prop sem prova de primitivo → insert
  classList(_p, () => ({ even: isEven.get(), odd: !isEven.get() }))
  text(_m0, () => count.get())                                                  // signal primitivo → text (D64)
  text(_m1, () => double.get())
  listen(_b1, 'click', () => count.set(count.get() + (props.step ?? 1)))
  text(_m2, () => props.step ?? 1)                                             // `?? 1` é provavelmente primitivo
  listen(_b2, 'click', () => count.set(count.get() - (props.step ?? 1)))
  text(_m3, () => props.step ?? 1)
  listen(_b3, 'click', reset)
  bool(_b3, 'disabled', () => count.get() === 0)

  return _el
}

// mount(<Counter step={5} />, '#app')  →  JSX fora de corpo reativo vira thunk; `mount` continua importado de `jotastic`
mount(() => component(Counter, { step: 5 }, { name: 'Counter', loc: 'Counter.tsx:26:7' }), '#app')
