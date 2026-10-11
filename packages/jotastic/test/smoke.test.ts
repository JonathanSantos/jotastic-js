import { expect, test } from 'vitest'

test('jotastic: pacote carrega', async () => {
  expect(await import('../src/index')).toBeTypeOf('object')
})
