import { expect, test } from 'vitest'

test('test: pacote carrega', async () => {
  expect(await import('../src/index')).toBeTypeOf('object')
})
