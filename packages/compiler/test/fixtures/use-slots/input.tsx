// 18 §4: useSlots(children) → slots(props.children); `slots.x` fica como está
import { useSlots } from 'jotastic'

export function Panel({ children }: { children: JSX.Element }) {
  const s = useSlots<'header' | 'row'>(children)
  return (
    <section>
      <header>{s.header}</header>
      <div>{s.default}</div>
      <p>{s.row?.(1)}</p>
    </section>
  )
}
