import { Slot } from 'jotastic'

export function Page() {
  return (
    <Card>
      <div>
        <Slot name="header">Título</Slot>
      </div>
    </Card>
  )
}

declare const Card: (p: { children: JSX.Element }) => JSX.Element
