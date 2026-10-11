// 18 §12: <Slot name> nos children de componente → objeto de slots
import { Slot } from 'jotastic'
import { Card } from './card'

export function Page({ admin, n }: { admin: boolean; n: number }) {
  let selected = 0
  return (
    <Card>
      <Slot name="header">
        <h2>Título {n}</h2>
      </Slot>
      <p>Corpo</p>
      <Slot name="row">{(item: number) => <b onClick={() => (selected = item)}>{item}</b>}</Slot>
      {admin && (
        <Slot name="footer">
          <button>Excluir</button>
        </Slot>
      )}
      <>
        <Slot name="aside">fixo</Slot>
      </>
      {n > 1 ? <Slot name="badge">muitos</Slot> : <Slot name="badge">um</Slot>}
      {admin ? null : <Slot name="hint">{selected}</Slot>}
    </Card>
  )
}

export function OnlySlots() {
  return (
    <Card>
      <Slot name="header">só cabeçalho</Slot>
    </Card>
  )
}
