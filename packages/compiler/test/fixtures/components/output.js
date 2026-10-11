import { template, state, reactive, insert, component, mergeProps, keyed } from 'jotastic/runtime'
import { Child, Tabs, Icon } from './lib'
const _t0 = template('<div data-jo="input.tsx:8"><!><!><!><!><!><!><!><!></div>')
const _t1 = template('<b>um</b>')
const _t2 = template('<i>b</i>')
const _t3 = template('<span></span>')
export function Parent(props) {
  const count = state(0, {
    name: 'count',
    loc: 'input.tsx:4:7',
  })
  const extra = reactive({
    a: 1,
  })
  const handler = () => count.set(count.get() + 1)
  const _el = _t0()
  const _m0 = _el.firstChild
  const _m1 = _m0.nextSibling
  const _m2 = _m1.nextSibling
  const _m3 = _m2.nextSibling
  const _m4 = _m3.nextSibling
  const _m5 = _m4.nextSibling
  const _m6 = _m5.nextSibling
  const _m7 = _m6.nextSibling
  insert(
    _el,
    component(
      Child,
      {
        title: 't',
        n: 1,
        flag: true,
        neg: -1,
        get id() {
          return props.id
        },
        get count() {
          return count.get()
        },
        onPick: (x) => count.set(x),
        handler,
        get icon() {
          return component(
            Icon,
            {},
            {
              name: 'Icon',
              loc: 'input.tsx:18:15',
            },
          )
        },
        list: [1, 2],
        get tpl() {
          return `x${count.get()}`
        },
      },
      {
        name: 'Child',
        loc: 'input.tsx:9:7',
      },
    ),
    _m0,
  )
  insert(
    _el,
    component(
      Child,
      mergeProps(
        extra,
        {
          get a() {
            return count.get()
          },
        },
        () => (count.get() > 1 ? extra : {}),
      ),
      {
        name: 'Child',
        loc: 'input.tsx:22:7',
      },
    ),
    _m1,
  )
  insert(
    _el,
    keyed(
      () => props.id,
      () =>
        component(
          Child,
          {},
          {
            name: 'Child',
            loc: 'input.tsx:23:7',
          },
        ),
    ),
    _m2,
  )
  insert(
    _el,
    component(
      Tabs.Tab,
      {
        label: 'x',
        children: 'texto',
      },
      {
        name: 'Tabs.Tab',
        loc: 'input.tsx:24:7',
      },
    ),
    _m3,
  )
  insert(
    _el,
    component(
      props.Comp,
      {
        get children() {
          const _el2 = _t1()
          return _el2
        },
      },
      {
        name: 'Comp',
        loc: 'input.tsx:25:7',
      },
    ),
    _m4,
  )
  insert(
    _el,
    component(
      Child,
      {
        get children() {
          const _el3 = _t2()
          return ['a ', () => count.get(), ' ', _el3]
        },
      },
      {
        name: 'Child',
        loc: 'input.tsx:28:7',
      },
    ),
    _m5,
  )
  insert(
    _el,
    component(
      Child,
      {
        children: (item) => {
          const _el4 = _t3()
          insert(_el4, () => item, null)
          return _el4
        },
      },
      {
        name: 'Child',
        loc: 'input.tsx:31:7',
      },
    ),
    _m6,
  )
  insert(
    _el,
    component(
      Child,
      {
        get children() {
          return count.get()
        },
      },
      {
        name: 'Child',
        loc: 'input.tsx:32:7',
      },
    ),
    _m7,
  )
  return _el
}
export function Root() {
  return component(
    Child,
    {
      title: 'root',
    },
    {
      name: 'Child',
      loc: 'input.tsx:38:10',
    },
  )
}
