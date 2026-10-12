import { template, reactive, component, onCleanup } from 'jotastic/runtime'
// 18 §6: prop com identificador de `let` comum (ex.: `ref`) vira getter (K-5);
// `<Ctx.Provider value={x}>` → `value` sempre getter (I-3: o Provider faz `provide(ctx, () => props.value)`)
import { createContext } from 'jotastic'
import { Tooltip } from './tooltip'
const _t0 = template('<b>alvo</b>')
const Theme = createContext({
  dark: false,
})
export function Page(props) {
  let anchor
  const theme = reactive({
    dark: false,
  })
  return component(
    Theme.Provider,
    {
      get value() {
        return theme
      },
      get children() {
        const _el = _t0()
        anchor = _el
        onCleanup(() => (anchor = undefined))
        return [
          _el,
          component(
            Tooltip,
            {
              get target() {
                return anchor
              },
              label: 'dica',
              get dark() {
                return props.dark
              },
            },
            {
              name: 'Tooltip',
              loc: 'input.tsx:14:7',
            },
          ),
        ]
      },
    },
    {
      name: 'Theme.Provider',
      loc: 'input.tsx:12:5',
    },
  )
}
