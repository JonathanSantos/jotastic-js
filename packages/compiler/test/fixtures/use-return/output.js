import { effect, signal, memo, reactive } from 'jotastic/runtime'
// 17 §Convenções: retorno por propriedade do literal

export function useReturn(x) {
  const count = signal(0, {
    name: 'count',
    loc: 'input.ts:5:7',
  })
  const user = signal(null, {
    name: 'user',
    loc: 'input.ts:6:7',
  })
  const double = memo(() => count.get() * 2, {
    name: 'double',
    loc: 'input.ts:7:9',
  })
  const config = reactive({
    theme: 'light',
  })
  const limit = 10
  effect(() => console.log(count.get()), {
    name: 'watch',
    loc: 'input.ts:10:3',
  })
  if (x() < 0)
    return {
      get count() {
        return count.get()
      },
      set count(v) {
        count.set(v)
      },
      early: true,
    }
  const _label = memo(() => `${count.get()} de ${limit}`, {
    name: 'label',
    loc: 'input.ts:19:12',
  })
  const _nested = memo(
    () => ({
      size: user.get()?.name.length,
    }),
    {
      name: 'nested',
      loc: 'input.ts:20:13',
    },
  )
  return {
    get count() {
      return count.get()
    },
    set count(v) {
      count.set(v)
    },
    get user() {
      return user.get()
    },
    set user(v) {
      user.set(v)
    },
    get double() {
      return double.get()
    },
    config,
    limit,
    get x() {
      return x()
    },
    get label() {
      return _label.get()
    },
    get nested() {
      return _nested.get()
    },
    literal: 'ok',
    inc: () => count.set(count.get() + 1),
    reset() {
      count.set(0)
    },
    get triple() {
      return count.get() * 3
    },
  }
}
export function useProxy() {
  const pos = reactive({
    x: 0,
    y: 0,
  })
  return pos
}
export function useNothing() {
  effect(() => console.log('x'), {
    name: 'watch',
    loc: 'input.ts:38:3',
  })
}
