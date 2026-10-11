export function Form() {
  let field: HTMLInputElement | undefined
  return <TextInput ref={field} />
}

declare const TextInput: () => JSX.Element
