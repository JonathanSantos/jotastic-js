// D63 (18 §8): `A === B` / `!==` / `Object.is` na linha, um lado só de fora (reativo) e o outro do item →
// `const _selN = selector(() => A)` antes do `list` e `_selN(B)` na linha
interface Row { id: number; label: string; parent: number }

export function Table({ rows, current }: { rows: Row[]; current: number }) {
  let selected = 0
  const LIMIT = 10
  return (
    <div>
      <table>
        <tbody>
          {rows.map((row) => (
            <tr class={selected === row.id ? 'danger' : ''} hidden={row.id !== selected}>
              <td aria-current={Object.is(current, row.parent)}>{row.label}</td>
              <td onClick={() => (selected = row.id)}>{row.id === LIMIT ? 'limite' : ''}</td>
              <td>{row.parent === row.id && <b>raiz</b>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        {rows.map((row) => {
          const active = row.id === selected
          return <li class={{ active }}>{active ? 'sim' : 'não'}</li>
        })}
      </ul>
    </div>
  )
}
