import { fileURLToPath } from 'node:url'
import { build, type Rollup } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import jotastic, { codeFrame, shouldCompile } from '../src/index'

const COUNTER = `export function Counter() {
  let count: number = 0
  return <button onClick={() => count++}>{count}</button>
}
`

const LOOP_RETURN = `export function List({ items }: { items: string[] }) {
  for (const i of items) {
    return <p>{i}</p>
  }
  return <p />
}
`

/** Contexto mínimo de plugin: `error` lança o objeto recebido, `warn` acumula. */
function setup(mode: 'serve' | 'build' = 'serve') {
  const plugin = jotastic()
  const configResolved = plugin.configResolved as (c: unknown) => void
  configResolved({ isProduction: mode === 'build', command: mode })
  const warnings: unknown[] = []
  const ctx = {
    warn: (w: unknown) => warnings.push(w),
    error: (e: unknown) => {
      throw e
    },
  }
  const transform = plugin.transform as unknown as (this: typeof ctx, code: string, id: string) => unknown
  return { plugin, warnings, run: (code: string, id: string) => transform.call(ctx, code, id) }
}

describe('@jotastic/vite', () => {
  test('metadados: enforce pre e esbuild sem transformar JSX', () => {
    const plugin = jotastic()
    expect(plugin.name).toBe('jotastic')
    expect(plugin.enforce).toBe('pre')
    expect((plugin.config as () => unknown)()).toEqual({ esbuild: { jsx: 'preserve' } })
  })

  test('transform de .tsx importa jotastic/runtime, remove tipos e devolve sourcemap', () => {
    const { run } = setup()
    const out = run(COUNTER, '/app/src/Counter.tsx') as { code: string; map: { sources: string[] } }
    expect(out.code).toMatch(/from 'jotastic\/runtime'/)
    expect(out.code).not.toContain(': number')
    expect(out.code).not.toContain('<button onClick')
    expect(out.map.sources[0]).toContain('Counter.tsx')
  })

  test('.ts sem corpo reativo passa intacto (null)', () => {
    const { run } = setup()
    expect(run('export const add = (a: number, b: number) => a + b\n', '/app/src/math.ts')).toBeNull()
    expect(run('export function x() {}', '/app/node_modules/lib/Comp.tsx')).toBeNull()
    expect(run('export function x() {}', '\0virtual.tsx')).toBeNull()
  })

  test('shouldCompile: .ts com use* compila; .d.ts e outros não', () => {
    expect(shouldCompile('/a/useCounter.ts', 'export function useCounter() {}')).toBe(true)
    expect(shouldCompile('/a/x.ts', 'export const useX = () => {}')).toBe(true)
    expect(shouldCompile('/a/x.ts', 'import { useX } from "./x"\nuseX()')).toBe(false)
    expect(shouldCompile('/a/x.d.ts', 'export function useX(): void')).toBe(false)
    expect(shouldCompile('/a/x.tsx?v=123', '')).toBe(true)
    expect(shouldCompile('/a/x.css', '')).toBe(false)
    // pacotes do workspace chegam pelo caminho real (fora de node_modules): .js nunca compila
    expect(shouldCompile('/repo/packages/jotastic/dist/index.js', 'function useSlots() {}')).toBe(false)
  })

  test('erro de compilação vira erro do Vite com loc, frame e mensagem do diagnóstico', () => {
    const { run } = setup()
    let err: { message: string; id: string; loc: { file: string; line: number; column: number }; frame: string }
    try {
      run(LOOP_RETURN, '/app/src/List.tsx')
      expect.unreachable()
    } catch (e) {
      err = e as typeof err
    }
    expect(err!.message).toContain('jotastic/return-in-loop-or-try')
    expect(err!.id).toBe('/app/src/List.tsx')
    expect(err!.loc).toEqual({ file: '/app/src/List.tsx', line: 3, column: 4 })
    expect(err!.frame).toContain('> 3 |     return <p>{i}</p>')
  })

  test('dev segue isProduction', () => {
    const dev = setup('serve').run(COUNTER, '/a/C.tsx') as { code: string }
    const prod = setup('build').run(COUNTER, '/a/C.tsx') as { code: string }
    expect(dev.code).toContain('data-jo=')
    expect(prod.code).not.toContain('data-jo=')
  })

  test('codeFrame marca a coluna', () => {
    expect(codeFrame('a\nbcd\ne', 2, 3)).toBe('  1 | a\n> 2 | bcd\n    |   ^\n  3 | e')
  })

  test('vite build de ponta a ponta', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = (await build({
      root: fileURLToPath(new URL('./fixtures/app', import.meta.url)),
      configFile: false,
      logLevel: 'silent',
      plugins: [jotastic()],
      build: { write: false, minify: false, rollupOptions: { external: [/^jotastic/] } },
    })) as Rollup.RollupOutput
    warn.mockRestore()
    const js = res.output.find((o) => o.type === 'chunk')!
    expect(js.type === 'chunk' && js.code).toMatch(/from "jotastic\/runtime"/)
  })
})
