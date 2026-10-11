import { expect, test } from 'vitest'

test('analyzer: pacote carrega', async () => {
  expect(await import('../src/index')).toBeTypeOf('object')
})
