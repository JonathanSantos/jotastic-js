// D64 (18 §5.1): `{expr}` escalar com marcador → `text(marker, read)`; o resto → `insert`. Conteúdo único → `insert`
export function Scalars({ step = 1, title, icon }: { step?: number; title: string; icon?: unknown }) {
  let count = 0
  let user = { name: 'a' }
  const double = count * 2
  const name = user.name
  const big = double > 10
  return (
    <section>
      <h2>{title}</h2>
      <p>
        {count} {double} {step} {big ? 'grande' : 'pequeno'} {`#${count}`} {count && 'x'}
      </p>
      <p>
        {title} {name} {icon ?? 'nenhum'} {user.name.length} {big || '-'} {user.name}
      </p>
      <ul>
        {[1, 2].map((n) => {
          let hits = 0
          return (
            <li onClick={() => hits++}>
              {hits} / {n}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
