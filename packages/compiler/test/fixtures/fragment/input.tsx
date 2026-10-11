import { Child } from './lib'

export function Frag({ a }: { a: string }) {
  return (
    <>
      <h1>titulo</h1>
      texto
      {a}
      <Child />
    </>
  )
}

export function Single() {
  return (
    <>
      <p>só um</p>
    </>
  )
}
