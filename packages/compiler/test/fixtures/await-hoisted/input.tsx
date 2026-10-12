// 18 §10.1 (W-5): `const x = f(await e)` / `(await e).y` → o `await` é içado para `_rN`; `x` lido como o
// inicializador com `_rN.value.get()` no lugar do `await`
import { pending } from 'jotastic'
import { api } from './api'

export async function Count({ q }: { q: string }) {
  let page = 1
  const n = (await api.search(q, page)).length
  const label = format(await api.user(q), page)
  return (
    <p class={{ dimmed: pending(n) }} onClick={() => page++}>
      {n} {label}
    </p>
  )
}

function format(u: { name: string }, page: number) {
  return `${u.name} (${page})`
}
