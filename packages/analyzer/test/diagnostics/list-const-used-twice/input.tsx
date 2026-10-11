export function Rows({ items }: { items: { id: string }[] }) {
  const rows = items.map((i) => <li key={i.id}>{i.id}</li>)
  return (
    <div>
      <ul>{rows}</ul>
      <ol>{rows}</ol>
    </div>
  )
}
