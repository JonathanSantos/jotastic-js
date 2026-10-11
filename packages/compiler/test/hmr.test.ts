import { describe, expect, test } from 'vitest'
import { compile, hasRefreshReset } from '../src/index'

const FILE = '/app/src/Counter.tsx'
const counter = (init: string, text = 'Zerar') => `export function Counter() {
  let count = ${init}
  let other = 'x'
  return <button onClick={() => (count = 0)}>{text(count)} {other} ${text}</button>
}
function text(n: number) {
  return String(n)
}
`

function hashes(code: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of code.matchAll(/name: '(\w+)',\s*loc: '[^']*',\s*hash: '(\w+)'/g)) out[m[1]!] = m[2]!
  return out
}

describe('compile({ hmr })', () => {
  test('hash do inicializador: estável, muda só quando o inicializador muda', () => {
    const a = hashes(compile(counter('0'), { filename: FILE, hmr: true }).code)
    const b = hashes(compile(counter('0', 'Reset'), { filename: FILE, hmr: true }).code)
    const c = hashes(compile(counter('1'), { filename: FILE, hmr: true }).code)
    expect(Object.keys(a)).toEqual(['count', 'other'])
    expect(b).toEqual(a)
    expect(c.count).not.toBe(a.count)
    expect(c.other).toBe(a.other)
  })

  test('sem hmr (ou em prod): nem hash nem rodapé', () => {
    for (const out of [
      compile(counter('0'), { filename: FILE }).code,
      compile(counter('0'), { filename: FILE, dev: false, hmr: true }).code,
    ]) {
      expect(out).not.toContain('hash:')
      expect(out).not.toContain('import.meta')
      expect(out).not.toContain('__hmr')
    }
  })

  test('rodapé: export default, renomeado e componente const; função comum não entra', () => {
    const code = `${counter('0')}const Other = () => <i />
export { Other as Renamed }
export default function App() {
  return <Counter />
}
`
    const out = compile(code, { filename: FILE, hmr: { preserveState: true } }).code
    expect(out).toContain(`if (import.meta.hot) {
  import.meta.hot.accept();
  __hmrComponents('/app/src/Counter.tsx', {
    Counter,
    Renamed: Other,
    default: App
  }, {
    preserveState: true
  });
}`)
  })

  test('export não-componente: registra sem accept; módulo sem componente exportado: sem rodapé', () => {
    const mixed = compile(
      `${counter('0')}export function useX() {\n  let a = 0\n  return { get a() { return a } }\n}\n`,
      {
        filename: FILE,
        hmr: true,
      },
    ).code
    expect(mixed).toContain('__hmrComponents(')
    expect(mixed).not.toContain('accept(')
    const none = compile(
      `import { mount } from 'jotastic'\nfunction App() {\n  return <p />\n}\nmount(<App />, '#app')\n`,
      {
        filename: '/app/src/main.tsx',
        hmr: true,
      },
    ).code
    expect(none).not.toContain('import.meta')
  })

  test('// @refresh reset no topo', () => {
    expect(hasRefreshReset('// @refresh reset\nexport const a = 1')).toBe(true)
    expect(hasRefreshReset('/* licença */\n// outra\n//   @refresh reset\nimport x from "y"')).toBe(true)
    expect(hasRefreshReset('import x from "y"\n// @refresh reset')).toBe(false)
    const out = compile('// @refresh reset\n' + counter('0'), { filename: FILE, hmr: true }).code
    expect(out).toMatch(/\{\s*reset: true\s*\}\);/)
  })
})
