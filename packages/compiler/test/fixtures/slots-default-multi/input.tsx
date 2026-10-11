// 18 §12 + X-8: 2+ filhos fora de <Slot> (default vira arrow com bloco) junto de um <Slot>.
// X-9: `ref` dentro de children/slot de componente ganha onCleanup (quem recebe decide quando os nós morrem).
import { Slot } from 'jotastic'
import { M } from './m'

export function A() {
  let input: HTMLInputElement | undefined
  return (
    <M>
      <p>a</p>
      <input ref={input} />
      <Slot name="actions"><b onClick={() => input?.focus()} /></Slot>
    </M>
  )
}

export function B() {
  return (
    <M>
      <>
        <p>a</p>
        <i />
      </>
      <Slot name="actions"><b /></Slot>
    </M>
  )
}
