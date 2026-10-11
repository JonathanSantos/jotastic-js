// 18 §5.3/§5.6: dentro de branch/item/continuação, `ref` ganha onCleanup e `autofocus` ganha autofocus(el)
export function Editor({ editing, items }: { editing: boolean; items: string[] }) {
  let input: HTMLInputElement | undefined
  let box: HTMLDivElement | undefined
  return (
    <div ref={box}>
      <input autofocus />
      {editing && <input ref={input} autofocus />}
      <ul>
        {items.map((x) => (
          <li>
            <input value={x} autofocus readOnly />
          </li>
        ))}
      </ul>
    </div>
  )
}
