// 17 §Convenções: retorno por propriedade do literal
import { watch } from 'jotastic'

export function useReturn(x: number) {
  let count = 0
  let user = null as { name: string } | null
  const double = count * 2
  const config = { theme: 'light' }
  const limit = 10
  watch(() => console.log(count))
  if (x < 0) return { count, early: true }
  return {
    count,
    user,
    double,
    config,
    limit,
    x,
    label: `${count} de ${limit}`,
    nested: { size: user?.name.length },
    literal: 'ok',
    inc: () => count++,
    reset() {
      count = 0
    },
    get triple() {
      return count * 3
    },
  }
}

export function useProxy() {
  const pos = { x: 0, y: 0 }
  return pos
}

export function useNothing() {
  watch(() => console.log('x'))
}
