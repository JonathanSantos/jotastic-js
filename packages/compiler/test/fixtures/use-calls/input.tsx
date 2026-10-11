// 18 §4/§11: useX(a, b) → useX(() => a', () => b'); `const u = useX()` (useResult) lido como `u.x`
import { useImported } from './lib'

function useLocal(a: number, b?: string) {
  let n = a
  return { n, b }
}

function useOuter(q: string) {
  const inner = useLocal(q.length)
  return { value: inner.n }
}

export function Comp({ step }: { step: number }) {
  let query = ''
  const local = useLocal(step * 2)
  const { n } = useLocal(1, query)
  const outer = useOuter(query)
  const ext = useImported(`/api?q=${query}`, () => (query = ''))
  return (
    <p onClick={() => (local.n = 0)}>
      {local.n} {n} {outer.value} {ext.data}
    </p>
  )
}
