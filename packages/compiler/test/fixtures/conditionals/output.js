import { template, signal, branches, insert, text, listen, component } from 'jotastic/runtime'
const _t0 = template('<div data-jo="input.tsx:5"><!><!><!><!><!><!><!><!><button>alternar</button></div>')
const _t1 = template('<p>aberto</p>')
const _t2 = template('<b></b>')
const _t3 = template('<i>vazio</i>')
const _t4 = template('<span>zero</span>')
const _t5 = template('<em>muitos</em>')
const _t6 = template('<i>anônimo</i>')
const _t7 = template('<i>sem nome</i>')
const _t8 = template('<p>b</p>')
const _t9 = template('<hr>')
const _t10 = template('<p data-jo="input.tsx:20">a</p>')
// 18 §7: condicionais com JSX em posição de filho → branches; sem JSX (K-4) → insert comum
export function Status(props) {
  const open = signal(false, {
    name: 'open',
    loc: 'input.tsx:3:7',
  })
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling
  const _m2 = _m1.nextSibling
  const _m3 = _m2.nextSibling
  const _m4 = _m3.nextSibling
  const _m5 = _m4.nextSibling
  const _m6 = _m5.nextSibling
  const _m7 = _m6.nextSibling
  const _button = _m7.nextSibling
  insert(
    _el,
    branches([
      [
        () => !!open.get(),
        () => {
          const _el2 = _t1()
          return _el2
        },
      ],
    ]),
    _m0,
  )
  insert(
    _el,
    branches(
      [
        [
          () => props.n > 0,
          () => {
            const _el3 = _t2()
            insert(_el3, () => props.n, null)
            return _el3
          },
        ],
      ],
      () => {
        const _el4 = _t3()
        return _el4
      },
    ),
    _m1,
  )
  insert(
    _el,
    branches(
      [
        [
          () => props.n === 0,
          () => {
            const _el5 = _t4()
            return _el5
          },
        ],
        [() => props.n === 1, () => 'um'],
      ],
      () => {
        const _el6 = _t5()
        return _el6
      },
    ),
    _m2,
  )
  insert(
    _el,
    branches([[() => !!props.user?.name, () => () => props.user?.name]], () => {
      const _el7 = _t6()
      return _el7
    }),
    _m3,
  )
  insert(
    _el,
    branches([[() => props.user?.name != null, () => () => props.user?.name]], () => {
      const _el8 = _t7()
      return _el8
    }),
    _m4,
  )
  insert(
    _el,
    branches([
      [
        () => props.tab === 'a',
        () =>
          component(
            A,
            {},
            {
              name: 'A',
              loc: 'input.tsx:11:13',
            },
          ),
      ],
      [
        () => props.tab === 'b',
        () => {
          const _el9 = _t8()
          return _el9
        },
      ],
    ]),
    _m5,
  )
  text(_m6, () => (props.n === 1 ? 'item' : 'itens'))
  insert(
    _el,
    branches([
      [
        () => !!open.get(),
        () => {
          const _el10 = _t9()
          return _el10
        },
      ],
    ]),
    _m7,
  )
  listen(_button, 'click', () => open.set(!open.get()))
  return _el
}
function A() {
  const _el = _t10()
  return _el
}
