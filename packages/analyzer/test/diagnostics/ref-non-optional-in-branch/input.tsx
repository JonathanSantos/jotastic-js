export function Search({ open }: { open: boolean }) {
  let input!: HTMLInputElement
  return <div onClick={() => input.focus()}>{open && <input ref={input} />}</div>
}
