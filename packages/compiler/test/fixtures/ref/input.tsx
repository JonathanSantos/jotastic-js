export function Refs() {
  let input: HTMLInputElement | undefined
  const track = (el: Element) => console.log(el)
  function focus() {
    input?.focus()
  }
  return (
    <div ref={track}>
      <input ref={input} />
      <button ref={(el) => console.log(el)} onClick={focus} />
    </div>
  )
}
