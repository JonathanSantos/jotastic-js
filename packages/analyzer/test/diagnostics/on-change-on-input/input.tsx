export function Name() {
  let name = ''
  return <input value={name} onChange={(e) => (name = e.currentTarget.value)} />
}
