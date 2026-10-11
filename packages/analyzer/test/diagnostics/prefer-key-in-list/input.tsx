export function Tags() {
  let tags: string[] = []
  return (
    <div>
      <button onClick={() => (tags = ['a', 'b'])}>Carregar</button>
      <ul>
        {tags.map((t) => (
          <li>{t}</li>
        ))}
      </ul>
    </div>
  )
}
