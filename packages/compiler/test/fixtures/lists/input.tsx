// 18 §8: `.map` com JSX em filho de elemento → list(parent, marker, source, render, key?, dev)
interface Row { id: number; name: string; done: boolean }

export function Lists({ rows, tags }: { rows: Row[]; tags: string[] }) {
  return (
    <section>
      <ul>
        {rows.map((r) => (
          <li class={{ done: r.done }}>{r.name}</li>
        ))}
      </ul>
      <ol>
        <li>primeiro</li>
        {rows.filter((r) => !r.done).map((r, i) => (
          <li key={r.name + i} onClick={() => console.log(i)}>
            {i + 1}. {r.name}
          </li>
        ))}
      </ol>
      <p>
        {tags.map((tag) => {
          const upper = tag.toUpperCase()
          return <span key={tag}>{upper}</span>
        })}
      </p>
    </section>
  )
}
