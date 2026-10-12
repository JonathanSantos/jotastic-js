import { Slot } from 'jotastic'

export function Page({ compact }: { compact: boolean }) {
  return (
    <Card>
      {compact ? <Slot name="header">Título</Slot> : <h1>Título completo</h1>}
      <p>Conteúdo</p>
    </Card>
  )
}

declare const Card: (p: { children: JSX.Element }) => JSX.Element
