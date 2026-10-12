// 18 §6: prop com identificador de `let` comum (ex.: `ref`) vira getter (K-5);
// `<Ctx.Provider value={x}>` → `value` sempre getter (I-3: o Provider faz `provide(ctx, () => props.value)`)
import { createContext } from 'jotastic'
import { Tooltip } from './tooltip'

const Theme = createContext({ dark: false })

export function Page({ dark }: { dark: boolean }) {
  let anchor: HTMLElement | undefined
  const theme = { dark: false }
  return (
    <Theme.Provider value={theme}>
      <b ref={anchor}>alvo</b>
      <Tooltip target={anchor} label="dica" dark={dark} />
    </Theme.Provider>
  )
}
