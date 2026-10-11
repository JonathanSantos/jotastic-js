import {
  template,
  signal,
  resource,
  continuation,
  branches,
  component,
  insert,
  prop,
  twoWay,
  listen,
  list,
} from 'jotastic/runtime'
// 18 §10.2, §10.9: early return antes e depois de `await`, `await` encadeado (continuações aninhadas), estado do
// setup (antes do `await`) e da continuação
import { api } from './api'
import { Spinner } from './spinner'
const _t0 = template('<p data-jo="input.tsx:10" class="off"></p>')
const _t1 = template('<section data-jo="input.tsx:14"><input><h1></h1><!></section>')
const _t2 = template('<ul></ul>')
const _t3 = template('<li></li>')
export function Page(props) {
  const query = signal('', {
    name: 'query',
    loc: 'input.tsx:7:7',
  })
  return branches(
    [
      [
        () => !!props.skip,
        () =>
          component(
            Spinner,
            {},
            {
              name: 'Spinner',
              loc: 'input.tsx:8:20',
            },
          ),
      ],
    ],
    () => {
      const _r0 = resource(() => api.user(props.id, query.get()), {
        name: 'user',
        loc: 'input.tsx:9:9',
      })
      return continuation(_r0, () =>
        branches(
          [
            [
              () => !_r0.value.get().active,
              () => {
                const _el = _t0()
                insert(_el, () => _r0.value.get().name, null)
                return _el
              },
            ],
          ],
          () => {
            const open = signal(false, {
              name: 'open',
              loc: 'input.tsx:11:7',
            })
            const _r1 = resource(() => api.posts(_r0.value.get().id), {
              name: 'posts',
              loc: 'input.tsx:12:9',
            })
            return continuation(_r1, () => {
              const _el2 = _t1()
              const _input = _el2.firstChild
              const _h1 = _input.nextSibling
              const _m0 = _h1.nextSibling
              prop(_input, 'value', () => query.get())
              twoWay(_input, 'value', (v) => query.set(v))
              listen(_h1, 'click', () => open.set(!open.get()))
              insert(_h1, () => _r0.value.get().name, null)
              insert(
                _el2,
                branches([
                  [
                    () => !!open.get(),
                    () => {
                      const _el3 = _t2()
                      list(
                        _el3,
                        null,
                        () => _r1.value.get(),
                        (p) => {
                          const _el4 = _t3()
                          insert(_el4, () => p.title, null)
                          return _el4
                        },
                        (p) => p.id,
                        {
                          loc: 'input.tsx:17:21',
                        },
                      )
                      return _el3
                    },
                  ],
                ]),
                _m0,
              )
              return _el2
            })
          },
        ),
      )
    },
  )
}
