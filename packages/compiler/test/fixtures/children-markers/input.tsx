export function Markers({ a, b }: { a: string; b: string }) {
  return (
    <div>
      <p>{a}</p>
      <p>
        {a}
        {b}
      </p>
      <p>
        x {a} y {b}
      </p>
      <p>{() => a}</p>
      <ul>
        <li>fixo</li>
        <li>{b}</li>
      </ul>
    </div>
  )
}
