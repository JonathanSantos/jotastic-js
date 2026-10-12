// I-3 (22): `const t = useContext(Ctx)` é reativo via o `const` que o recebe → `memo(() => useContext(Ctx))`
import { createContext, useContext } from 'jotastic'

const Theme = createContext({ color: 'light' })

export function Label() {
  const theme = useContext(Theme)
  const { color } = useContext(Theme)
  return (
    <p class={theme.color}>
      {color}
    </p>
  )
}
