export function Rewrites() {
  let count = 0
  let user = null as { name: string } | null
  let items: number[] = []
  let name = 'a'
  let a = 1
  let b = 2
  let handlerOnly = 0
  const total = count + items.length
  const label = name.toUpperCase()

  function mutate() {
    count++
    ++count
    count--
    count += 2
    count *= 3
    name ||= 'x'
    name ??= 'y'
    const old = count++
    const now = ++count
    user = { name: 'b' }
    items.push(1)
    items = [...items, 2]
    ;[a, b] = [b, a]
    handlerOnly++
    for (let i = 0; i < 3; count++) i++
    const name2 = (name: string) => name
    console.log(old, now, name2('z'), handlerOnly)
  }

  return (
    <p onClick={mutate}>
      {count} {total} {label} {user?.name} {a} {b}
    </p>
  )
}
