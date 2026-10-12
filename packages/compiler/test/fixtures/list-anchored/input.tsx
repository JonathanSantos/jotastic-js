// D64/K-11 (18 §8): lista sem elemento pai fixo (fragmento, children de componente, condicional) → âncora `<!>` num
// fragmento + `list(null, marker, …)`
import { Panel } from './panel'

export function Anchored({ items, open }: { items: string[]; open: boolean }) {
  return (
    <>
      {items.map((it) => (
        <p>{it}</p>
      ))}
      <Panel>
        {items.map((it, i) => (
          <i key={it}>{i}</i>
        ))}
      </Panel>
      <div>
        {open && items.map((it) => <b>{it}</b>)}
        {open ? <hr /> : items.map((it) => <s>{it}</s>)}
      </div>
    </>
  )
}
