import { expect, test } from 'vitest'

test('vite: pacote carrega', async () => {
  expect(await import('../src/index')).toBeTypeOf('object')
})
