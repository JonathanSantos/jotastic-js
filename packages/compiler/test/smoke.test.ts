import { expect, test } from 'vitest'

test('compiler: pacote carrega', async () => {
  expect(await import('../src/index')).toBeTypeOf('object')
})
