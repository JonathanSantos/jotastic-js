// K-14: filho único condicional de componente → `get children() { return branches(…) }`; K-11 (lista) segue accessor
import { Card } from './card'

export function A({ x, items }: { x: number; items: string[] }) {
  return (
    <div>
      <Card>{x > 0 && <p>{x}</p>}</Card>
      <Card>{x ? <b /> : 'nada'}</Card>
      <Card>{items.map((i) => <i>{i}</i>)}</Card>
    </div>
  )
}
