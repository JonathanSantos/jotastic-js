// 18 §8: o callback é um mini-corpo reativo: `let` lido no JSX do item → signal; `const` derivado → memo
export function Accordion({ items }: { items: { id: string; title: string; body: string }[] }) {
  return (
    <div>
      {items.map((item, i) => {
        let open = false
        const title = `${i + 1}. ${item.title}`
        const plain = 'x'
        return (
          <section key={item.id}>
            <h3 onClick={() => (open = !open)}>{title}</h3>
            {open && <p>{item.body}</p>}
            <small>{plain}</small>
          </section>
        )
      })}
    </div>
  )
}
