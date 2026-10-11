// 18 §9: else if / else → casos + fallback; prelude dentro do render do caso; `return` de não-JSX
export function Badge({ n, label }: { n: number; label: string }) {
  if (n < 0) {
    const msg = `inválido: ${n}`
    return <b class="bad">{msg}</b>
  } else if (n === 0) return null
  else if (n > 99) return '99+'
  else {
    console.log('render')
    return <span>{label}</span>
  }
}

export function Nested({ a, b }: { a: boolean; b: boolean }) {
  if (a) return <p>a</p>
  const x = b ? 1 : 2
  if (b) return <p>b</p>
  return <p>{x}</p>
}
