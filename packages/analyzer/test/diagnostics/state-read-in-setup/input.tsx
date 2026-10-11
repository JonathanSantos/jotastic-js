export function Counter({ start }: { start: number }) {
  let count = start
  console.log(count)
  return <button onClick={() => count++}>{count}</button>
}
