import { test, expect } from 'vitest'
test('contorno happy-dom: irmãos de <form>', () => {
  const d = document.createElement('div')
  d.innerHTML = '<b></b><form></form><i></i>'
  const f = d.childNodes[1]!
  expect(f.nextSibling?.nodeName).toBe('I')
  expect(f.previousSibling?.nodeName).toBe('B')
  expect(d.lastChild!.previousSibling).toBe(f)
})
