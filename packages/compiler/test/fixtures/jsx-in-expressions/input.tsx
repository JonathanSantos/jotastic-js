import { Child } from './lib'

export function Nested({ ok }: { ok: boolean }) {
  let n = 0
  const make = () => <em>{n}</em>
  function build() {
    const node = <u>{n}</u>
    return node
  }
  return (
    <div>
      <Child icon={ok ? <b>{n}</b> : null} render={() => <i>{n}</i>} />
      <Child items={[<a />, <a />]} />
      {[make(), build()]}
    </div>
  )
}
