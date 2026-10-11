import { mount } from 'jotastic'
import { App } from './App'

const header = <h1 class="top">Olá</h1>

function render(name: string) {
  return <p>{name}</p>
}

mount(<App title="x" />, '#app', { onError: console.error })
mount(
  <div>
    <App />
  </div>,
  document.body,
)
export { header, render }
