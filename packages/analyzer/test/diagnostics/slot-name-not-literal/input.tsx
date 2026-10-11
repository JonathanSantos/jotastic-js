import { Slot } from 'jotastic'

export function Page({ where }: { where: string }) {
  return (
    <Card>
      <Slot name={where}>Título</Slot>
    </Card>
  )
}

declare const Card: (p: { children: JSX.Element }) => JSX.Element
