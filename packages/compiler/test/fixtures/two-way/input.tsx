export function Form({ external }: { external: string }) {
  let text = ''
  let age = 0
  let vol = 5
  let agree = false
  let plan = 'free'
  let tags: string[] = []
  let note = ''
  let choice = 'a'
  let locked = ''
  const user = { name: '' }
  let kind = 'text'
  return (
    <form>
      <input value={text} />
      <input type="number" value={age} />
      <input type="range" value={vol} />
      <input type="checkbox" checked={agree} />
      <select value={plan}>
        <option value="free">Free</option>
      </select>
      <select multiple value={tags} />
      <textarea value={note} />
      <input type="radio" checked={choice === 'a'} />
      <input value={locked} onInput={(e) => (locked = e.currentTarget.value)} />
      <input value={locked} readOnly />
      <input value={user.name} />
      <input value={external} />
      <input type={kind} value={text} />
      <input value={text.trim()} />
    </form>
  )
}
