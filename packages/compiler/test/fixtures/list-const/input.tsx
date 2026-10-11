// 18 §8: `const rows = items.map(…)` → função `(parent, marker) => list(…)`, `{rows}` → `_rows(parent, marker)`
export function Table({ items }: { items: { id: string; label: string }[] }) {
  const rows = items.map((item) => <tr><td>{item.label}</td></tr>)
  return (
    <table>
      <thead>
        <tr>
          <th>Nome</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  )
}
