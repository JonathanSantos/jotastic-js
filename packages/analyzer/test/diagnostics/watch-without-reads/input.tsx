import { watch } from 'jotastic'

export function Title() {
  watch(() => {
    document.title = 'Olá'
  })
  return <h1>Olá</h1>
}
